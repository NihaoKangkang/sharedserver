from __future__ import annotations

from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from .clipboard import ClipboardPolicy
from .config import AppConfig
from .file_manager import FileManager, UploadTooLargeError
from .models import (
    DirectoryCreate,
    DirectoryListing,
    TextContent,
    UploadResult,
)
from .security import SecurityError
from .websocket import ClipboardHub


def _http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, SecurityError):
        return HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, (FileNotFoundError, NotADirectoryError)):
        return HTTPException(status_code=404, detail="file or directory not found")
    if isinstance(exc, FileExistsError):
        return HTTPException(status_code=409, detail="a file with that name already exists")
    if isinstance(exc, UploadTooLargeError):
        return HTTPException(status_code=413, detail=str(exc))
    return HTTPException(status_code=400, detail=str(exc))


def _same_origin(websocket: WebSocket) -> bool:
    origin = websocket.headers.get("origin")
    host = websocket.headers.get("host")
    return not origin or not host or urlsplit(origin).netloc.casefold() == host.casefold()


def create_app(config: AppConfig) -> FastAPI:
    package_dir = Path(__file__).parent
    policy = ClipboardPolicy(config.clipboard)
    manager = FileManager(config.share.directory, config.share.max_upload_size, policy)
    hub = ClipboardHub()

    app = FastAPI(title="SharedServer", version="0.1.0", docs_url=None, redoc_url=None)
    app.state.config = config
    app.state.file_manager = manager
    app.state.clipboard_hub = hub
    app.mount("/static", StaticFiles(directory=package_dir / "static"), name="static")

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; connect-src 'self' ws: wss:; "
            "img-src 'self' blob: data:; object-src 'none'; frame-ancestors 'none'"
        )
        return response

    @app.get("/", response_class=HTMLResponse, include_in_schema=False)
    async def index() -> HTMLResponse:
        html = (package_dir / "templates" / "index.html").read_text(encoding="utf-8")
        return HTMLResponse(html, headers={"Cache-Control": "no-store"})

    @app.get("/api/files", response_model=DirectoryListing)
    async def list_files(path: str = Query(default="")) -> DirectoryListing:
        try:
            return manager.list_directory(path)
        except (SecurityError, FileNotFoundError, NotADirectoryError, OSError) as exc:
            raise _http_error(exc) from exc

    @app.post("/api/directories", status_code=201)
    async def create_directory(body: DirectoryCreate) -> dict[str, str]:
        try:
            return {"path": manager.create_directory(body.path, body.name)}
        except (SecurityError, FileNotFoundError, NotADirectoryError, FileExistsError, OSError) as exc:
            raise _http_error(exc) from exc

    @app.put("/api/upload", response_model=UploadResult, status_code=201)
    async def upload(
        request: Request,
        path: str = Query(default=""),
        filename: str = Query(min_length=1, max_length=1024),
    ) -> UploadResult:
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > config.share.max_upload_size:
                    raise HTTPException(status_code=413, detail="upload is too large")
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="invalid Content-Length") from exc
        try:
            return await manager.save_upload(path, filename, request.stream())
        except (
            SecurityError,
            FileNotFoundError,
            NotADirectoryError,
            FileExistsError,
            UploadTooLargeError,
            OSError,
        ) as exc:
            raise _http_error(exc) from exc

    @app.get("/api/download")
    async def download(path: str = Query(min_length=1)) -> FileResponse:
        try:
            file = manager.regular_file(path)
            return FileResponse(file, filename=file.name)
        except (SecurityError, FileNotFoundError, OSError) as exc:
            raise _http_error(exc) from exc

    @app.get("/api/text", response_model=TextContent)
    async def text_content(path: str = Query(min_length=1)) -> TextContent:
        try:
            file = manager.regular_file(path)
            return TextContent(content=policy.read_text(file))
        except (SecurityError, FileNotFoundError, ValueError, OSError) as exc:
            raise _http_error(exc) from exc

    @app.get("/api/image")
    async def image_content(path: str = Query(min_length=1)) -> FileResponse:
        try:
            file = manager.regular_file(path)
            if policy.copy_kind(file) != "image":
                raise ValueError("file type is not allowed for image copying")
            return FileResponse(file, headers={"Cache-Control": "no-store"})
        except (SecurityError, FileNotFoundError, ValueError, OSError) as exc:
            raise _http_error(exc) from exc

    @app.websocket("/ws")
    async def clipboard_socket(websocket: WebSocket) -> None:
        if not _same_origin(websocket):
            await websocket.close(code=1008, reason="origin not allowed")
            return
        await hub.handle(websocket)

    return app
