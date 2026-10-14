"""Question/Content routes — list chunks, get next question, fetch lesson."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from ...domain.schemas import Chapter, Chunk, Concept, Question
from ..middleware import require_device_auth

router = APIRouter(prefix="/content", tags=["content"])


@router.get("/chapters", response_model=list[Chapter])
async def list_chapters(request: Request):
    pack = request.app.state.pack_index
    return list(pack.chapters.values())


@router.get("/chapters/{chapter_id}", response_model=Chapter)
async def get_chapter(chapter_id: str, request: Request):
    pack = request.app.state.pack_index
    ch = pack.get_chapter(chapter_id)
    if not ch:
        raise HTTPException(status_code=404, detail="chapter not found")
    return ch


@router.get("/concepts/{concept_id}", response_model=Concept)
async def get_concept(concept_id: str, request: Request):
    pack = request.app.state.pack_index
    c = pack.get_concept(concept_id)
    if not c:
        raise HTTPException(status_code=404, detail="concept not found")
    return c


@router.get("/concepts/{concept_id}/chunks", response_model=list[Chunk])
async def list_chunks_for_concept(concept_id: str, request: Request):
    pack = request.app.state.pack_index
    return pack.list_chunks_for_concept(concept_id)


@router.get("/chunks/{chunk_id}", response_model=Chunk)
async def get_chunk(chunk_id: str, request: Request):
    pack = request.app.state.pack_index
    c = pack.get_chunk(chunk_id)
    if not c:
        raise HTTPException(status_code=404, detail="chunk not found")
    return c


@router.get("/concepts/{concept_id}/questions/next", response_model=Question)
async def get_next_question(
    concept_id: str,
    request: Request,
    difficulty: str | None = None,
    ctx: tuple[str, str] = Depends(require_device_auth),
):
    pack = request.app.state.pack_index
    qs = pack.list_questions_for_concept(concept_id, difficulty=difficulty)
    if not qs:
        raise HTTPException(status_code=404, detail="no questions for concept")
    # Pick the first matching question — deterministic
    return qs[0]


__all__ = ["router"]
