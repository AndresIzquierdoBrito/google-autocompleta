"""freeze reviewed snapshots and three-round game metadata"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7f4c2d9a2e1f"
down_revision: str | None = "c9e19ac30e4e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("prompts", sa.Column("match_config", sa.JSON(), nullable=True))
    op.add_column("puzzles", sa.Column("prompt_text", sa.String(length=160), nullable=True))
    op.add_column("puzzles", sa.Column("aliases", sa.JSON(), nullable=True))
    op.add_column("puzzles", sa.Column("content_version", sa.String(length=24), nullable=True))
    op.add_column("puzzles", sa.Column("matcher_version", sa.String(length=24), nullable=True))
    op.add_column("puzzles", sa.Column("random_eligible", sa.Boolean(), nullable=True))
    op.add_column("puzzles", sa.Column("approval_status", sa.String(length=16), nullable=True))
    op.add_column("puzzles", sa.Column("match_index", sa.JSON(), nullable=True))
    op.add_column("games", sa.Column("planned_puzzle_ids", sa.JSON(), nullable=True))
    op.add_column("games", sa.Column("round_summaries", sa.JSON(), nullable=True))
    op.add_column("games", sa.Column("content_version", sa.String(length=24), nullable=True))
    op.add_column("games", sa.Column("version", sa.Integer(), nullable=True))
    op.add_column("game_rounds", sa.Column("version", sa.Integer(), nullable=True))
    bind = op.get_bind()
    bind.execute(sa.text("UPDATE prompts SET match_config = '{}' WHERE match_config IS NULL"))
    bind.execute(
        sa.text(
            "UPDATE puzzles SET aliases = '{}', match_index = '{}', "
            "content_version = 'legacy', matcher_version = 'v1', "
            "random_eligible = CASE WHEN puzzle_date IS NULL THEN 1 ELSE 0 END "
            "WHERE aliases IS NULL"
        )
    )
    bind.execute(
        sa.text("UPDATE puzzles SET approval_status = 'legacy' WHERE approval_status IS NULL")
    )
    bind.execute(
        sa.text(
            "UPDATE games SET planned_puzzle_ids = '[]', round_summaries = '[]', "
            "content_version = 'legacy', version = 1 "
            "WHERE planned_puzzle_ids IS NULL"
        )
    )
    bind.execute(sa.text("UPDATE game_rounds SET version = 1 WHERE version IS NULL"))


def downgrade() -> None:
    op.drop_column("game_rounds", "version")
    op.drop_column("games", "version")
    op.drop_column("games", "content_version")
    op.drop_column("games", "round_summaries")
    op.drop_column("games", "planned_puzzle_ids")
    op.drop_column("puzzles", "match_index")
    op.drop_column("puzzles", "random_eligible")
    op.drop_column("puzzles", "matcher_version")
    op.drop_column("puzzles", "content_version")
    op.drop_column("puzzles", "aliases")
    op.drop_column("puzzles", "prompt_text")
    op.drop_column("puzzles", "approval_status")
    op.drop_column("prompts", "match_config")
