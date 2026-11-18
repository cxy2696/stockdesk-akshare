"""FastAPI app = API + built frontend (single origin, no CORS hassle)."""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import api, db, repo, scheduler
from .config import APP_VERSION, frontend_dist

FRONT = frontend_dist()


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    # Startup used to be duplicated between the router and the app (and used
    # the deprecated on_event hook). One lifespan keeps it deterministic.
    db.init()
    if not db.get_setting("account"):
        db.set_setting("account", repo.DEFAULT_ACCOUNT)
    scheduler.start()
    try:
        yield
    finally:
        scheduler.stop()


def create() -> FastAPI:
    root = FastAPI(title="StockDesk", version=APP_VERSION, docs_url="/api/docs",
                   openapi_url="/api/openapi.json", lifespan=_lifespan)
    root.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    @root.middleware("http")
    async def _no_store_ui(request: Request, call_next):
        """Never let the desktop WebView cache the SPA shell or hashed assets."""
        response = await call_next(request)
        path = request.url.path
        if path == "/" or path.startswith("/assets"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

    root.include_router(api.router)

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
            # A missing asset must be a real 404, not an HTML page with a 200:
            # otherwise icons/manifests/bundles fail silently in the UI.
            if Path(full_path).suffix:
                return JSONResponse({"ok": False, "error": "not found"}, status_code=404)
            return HTMLResponse(index.read_text(encoding="utf-8"))
    else:
        @root.get("/")
        def dev_index():
            return JSONResponse({"ok": True, "message": "Frontend not built. Run: cd frontend && npm run build"})
    return root
