from fastapi.testclient import TestClient

from google_autocompleta.services.games import GameService


def start_archive(client: TestClient, puzzle_date: str = "2026-08-03") -> dict:
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
    assert archive.json()[0]["date"] == current.json()["date"]


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

    correct = api_client.post(
        f"/api/v1/games/{game['id']}/guesses",
        json={"guess": "VAIANA!!!"},
    )
    assert correct.status_code == 200
    state = correct.json()
    assert state["last_result"]["outcome"] == "correct"
    assert state["score"] == 10_000
    assert state["slots"][0]["completion"] == "moana se llama vaiana"
    assert state["slots"][1]["completion"] is None

    duplicate = api_client.post(
        f"/api/v1/games/{game['id']}/guesses",
        json={"guess": "por que en espana moana se llama vaiana"},
    )
    assert duplicate.json()["last_result"]["outcome"] == "duplicate"
    assert duplicate.json()["misses"] == 0


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


def test_random_game_advances_five_unique_rounds(api_client: TestClient) -> None:
    response = api_client.post("/api/v1/games", json={"mode": "random", "category": "comida"})
    assert response.status_code == 201
    state = response.json()
    prompts = {state["prompt"]}

    for round_number in range(1, 6):
        state = api_client.post(f"/api/v1/games/{state['id']}/give-up").json()
        if round_number < 5:
            assert state["status"] == "round_complete"
            next_response = api_client.post(f"/api/v1/games/{state['id']}/next-round")
            assert next_response.status_code == 200
            state = next_response.json()
            assert state["round_number"] == round_number + 1
            prompts.add(state["prompt"])

    assert state["status"] == "complete"
    assert len(prompts) == 5


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
