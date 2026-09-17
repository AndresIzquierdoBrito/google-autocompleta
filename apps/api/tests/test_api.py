import json
from pathlib import Path

from fastapi.testclient import TestClient

from google_autocompleta.api import audit as audit_api
from google_autocompleta.services.games import GameService


def start_archive(client: TestClient, puzzle_date: str = "2026-09-14") -> dict:
    response = client.post("/api/v1/games", json={"mode": "archive", "date": puzzle_date})
    assert response.status_code == 201
    return response.json()


def test_categories_and_seeded_archive(api_client: TestClient) -> None:
    categories = api_client.get("/api/v1/categories")
    assert categories.status_code == 200
    assert [item["slug"] for item in categories.json()] == [
        "cultura",
        "personas",
        "nombres",
        "preguntas",
        "animales",
        "entretenimiento",
        "comida",
    ]

    archive = api_client.get("/api/v1/daily/archive")
    assert archive.status_code == 200
    current = api_client.get("/api/v1/daily/current")
    assert current.status_code == 200
    assert len(archive.json()) >= 15
    assert current.json()["date"] not in {item["date"] for item in archive.json()}
    assert archive.json()[0]["date"] < current.json()["date"]


def test_local_audit_pack_exposes_v5_prompt_draft(
    api_client: TestClient, tmp_path: Path, monkeypatch
) -> None:
    draft_path = tmp_path / "overhaul-v5-prompts.json"
    draft_path.write_text(
        json.dumps(
            {
                "content_version": "5-draft",
                "status": "english-source-translation-draft",
                "prompts": {"cultura": ["algo español es"]},
                "english_source_prompts": {"cultura": ["Spain"]},
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(audit_api, "PROMPT_DRAFT_PATH", draft_path)
    monkeypatch.setattr(audit_api, "PROMPT_AUDIT_PATH", tmp_path / "missing-audit.json")

    response = api_client.get("/api/v1/audit/boards")
    assert response.status_code == 200
    payload = response.json()
    assert payload["content_version"] == "5-draft"
    assert len(payload["boards"]) == 1
    assert payload["status"] == "english-source-translation-draft"
    assert payload["boards"][0]["completions"] == []
    assert payload["boards"][0]["id"].startswith("v5-draft-")
    assert payload["boards"][0]["english_prompt"] == "Spain"
    assert payload["boards"][0]["audit"] is None


def test_local_audit_pack_exposes_captured_v5_suggestions(api_client: TestClient) -> None:
    response = api_client.get("/api/v1/audit/boards")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["boards"]) == 210
    assert all(board["audit"] is not None for board in payload["boards"])
    assert all(board["audit"]["google_suggestions"] for board in payload["boards"])


def test_local_audit_pack_falls_back_to_public_content_without_private_draft(
    api_client: TestClient, tmp_path: Path, monkeypatch
) -> None:
    missing = tmp_path / "missing.json"
    monkeypatch.setattr(audit_api, "PROMPT_DRAFT_PATH", missing)
    monkeypatch.setattr(audit_api, "PROMPT_AUDIT_PATH", missing)
    monkeypatch.setattr(audit_api, "AUDIT_PATH", missing)

    response = api_client.get("/api/v1/audit/boards")
    assert response.status_code == 200
    payload = response.json()
    assert payload["content_version"] == "3"
    assert payload["status"] == "applied-v5-audit-first-ten"
    assert len(payload["boards"]) == 210
    assert payload["boards"][0]["completions"]


def test_loopback_web_origin_can_start_game(api_client: TestClient) -> None:
    preflight = api_client.options(
        "/api/v1/games",
        headers={
            "Origin": "http://127.0.0.1:8081",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == "http://127.0.0.1:8081"


def test_hidden_answers_guess_normalization_and_duplicate(api_client: TestClient) -> None:
    game = start_archive(api_client)
    assert all(slot["completion"] is None for slot in game["slots"])
    assert all(slot["answer_length"] > 0 for slot in game["slots"])

    correct = api_client.post(
        f"/api/v1/games/{game['id']}/guesses",
        json={"guess": "mundial"},
    )
    assert correct.status_code == 200
    state = correct.json()
    assert state["last_result"]["outcome"] == "correct"
    assert state["score"] == 10_000
    assert state["slots"][0]["completion"] == "mundial"
    assert state["slots"][1]["completion"] is None

    duplicate = api_client.post(
        f"/api/v1/games/{game['id']}/guesses",
        json={"guess": "España mundial"},
    )
    assert duplicate.json()["last_result"]["outcome"] == "duplicate"
    assert duplicate.json()["misses"] == 0


def test_today_is_not_available_as_archive(api_client: TestClient) -> None:
    today = api_client.get("/api/v1/daily/current").json()["date"]
    response = api_client.post("/api/v1/games", json={"mode": "archive", "date": today})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "today_not_archive"


def test_retired_letter_list_scaffold_is_not_a_valid_answer(api_client: TestClient) -> None:
    response = api_client.post("/api/v1/games", json={"mode": "random", "category": "nombres"})
    assert response.status_code == 201
    game = response.json()
    response = api_client.post(f"/api/v1/games/{game['id']}/guesses", json={"guess": "empiezan"})
    assert response.status_code == 200
    assert response.json()["last_result"]["outcome"] == "incorrect"
    assert response.json()["misses"] == 1


def test_keyword_matching_ignores_connector_words() -> None:
    answers = [
        "qué puedo cocinar con el pollo",
        "qué puedo cocinar con arroz",
    ]
    assert GameService._matching_rank("qué puedo cocinar con", answers, "pollo") == 1
    assert GameService._matching_rank("qué puedo cocinar con", answers, "EL POLLO!!!") == 1
    assert GameService._matching_rank("qué puedo cocinar con", answers, "el") is None


def test_keyword_matching_returns_all_matching_ranks() -> None:
    answers = [
        "mejores series para ver en amazon prime",
        "mejores series para ver en prime video",
    ]
    assert GameService._matching_ranks("mejores series para", answers, "prime") == [1, 2]


def test_four_misses_finish_and_reveal_round(api_client: TestClient) -> None:
    game = start_archive(api_client)
    state = game
    for index in range(4):
        response = api_client.post(
            f"/api/v1/games/{game['id']}/guesses",
            json={"guess": f"respuesta imposible {index}"},
        )
        assert response.status_code == 200
        state = response.json()
    assert state["status"] == "complete"
    assert state["misses_remaining"] == 0
    assert all(slot["completion"] for slot in state["slots"])


def test_random_game_advances_three_unique_rounds(api_client: TestClient) -> None:
    response = api_client.post("/api/v1/games", json={"mode": "random", "category": "comida"})
    assert response.status_code == 201
    state = response.json()
    prompts = {state["prompt"]}

    for round_number in range(1, 4):
        state = api_client.post(f"/api/v1/games/{state['id']}/give-up").json()
        if round_number < 3:
            assert state["status"] == "round_complete"
            next_response = api_client.post(f"/api/v1/games/{state['id']}/next-round")
            assert next_response.status_code == 200
            state = next_response.json()
            assert state["round_number"] == round_number + 1
            prompts.add(state["prompt"])

    assert state["status"] == "complete"
    assert len(prompts) == 3


def test_api_errors_are_structured(api_client: TestClient) -> None:
    bad_category = api_client.post(
        "/api/v1/games", json={"mode": "random", "category": "inventada"}
    )
    assert bad_category.status_code == 400
    assert bad_category.json()["error"]["code"] == "invalid_category"

    missing = api_client.get("/api/v1/games/no-existe")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "game_not_found"

    invalid_payload = api_client.post("/api/v1/games", json={"mode": "archive"})
    assert invalid_payload.status_code == 422
    assert invalid_payload.json()["error"]["code"] == "validation_error"
