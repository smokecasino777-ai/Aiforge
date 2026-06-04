"""Legal HTML pages (Privacy + Terms)."""
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from legal_pages import PRIVACY_HTML, TERMS_HTML

router = APIRouter(tags=["legal"])


@router.get("/legal/privacy", response_class=HTMLResponse)
async def legal_privacy():
    return HTMLResponse(content=PRIVACY_HTML, status_code=200)


@router.get("/legal/terms", response_class=HTMLResponse)
async def legal_terms():
    return HTMLResponse(content=TERMS_HTML, status_code=200)
