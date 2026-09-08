from fastapi import APIRouter

from google_autocompleta.data import CATEGORY_NAMES
from google_autocompleta.schemas import CategoryOut

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
async def list_categories() -> list[CategoryOut]:
    return [CategoryOut(slug=slug, name=name) for slug, name in CATEGORY_NAMES.items()]
