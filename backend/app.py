"""FastAPI app = API + built frontend (single origin, no CORS hassle)."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import api, db, repo
from .config import APP_VERSION, frontend_dist

FRONT = frontend_dist()


def create() -> FastAPI:
    root = FastAPI(title="StockDesk", version=APP_VERSION, docs_url="/api/docs", openapi_url="/api/openapi.json")
    root.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    root.include_router(api.router)

    @root.on_event("startup")
    def _startup():
        db.init()
        if not db.get_setting("account"):
            db.set_setting("account", repo.DEFAULT_ACCOUNT)

    assets = FRONT / "assets"
    if assets.exists():
        root.mount("/assets", StaticFiles(directory=assets), name="assets")

    index = FRONT / "index.html"
    if index.exists():
        @root.get("/favicon.svg", include_in_schema=False)
        def favicon():
            f = FRONT / "favicon.svg"
            return FileResponse(f) if f.exists() else JSONResponse({}, status_code=404)

        @root.get("/{full_path:path}", include_in_schema=False)
        def spa(full_path: str):
            if full_path.startswith(("api/", "ws/")):
                return JSONResponse({"ok": False, "error": "not found"}, status_code=404)
            target = FRONT / full_path
            if full_path and target.is_file():
                return FileResponse(target)
            return HTMLResponse(index.read_text(encoding="utf-8"))
    else:
        @root.get("/")
        def dev_index():
            return JSONResponse({"ok": True, "message": "Frontend not built. Run: cd frontend && npm run build"})
    return root
