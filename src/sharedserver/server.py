from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .clipboard import ClipboardPolicy
from . import __version__
from .access import AccessPolicy, same_origin
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


def create_app(config: AppConfig) -> FastAPI:
    package_dir = Path(__file__).parent
    policy = ClipboardPolicy(config.clipboard)
    manager = FileManager(config.share.directory, config.share.max_upload_size, policy,
                          (config.config_file,) if config.config_file else ())
    hub = ClipboardHub(config.clipboard.max_text_size)
    access = AccessPolicy(config)

    app = FastAPI(title="SharedServer", version=__version__, docs_url=None,
                  redoc_url=None, openapi_url=None)
    app.state.config = config
    app.state.file_manager = manager
    app.state.clipboard_hub = hub
    app.mount("/static", StaticFiles(directory=package_dir / "static"), name="static")

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        if not access.allowed_host(request) or not same_origin(request):
            response = JSONResponse({"detail": "host or origin not allowed"}, status_code=403)
        elif not access.authorized(request):
            response = JSONResponse(
                {"detail": "Open the private link or scan the QR code shown in the server terminal."},
                status_code=403,
            )
        elif config.security.token and request.url.path == "/" and "token" in request.query_params:
            response = RedirectResponse("/", status_code=303)
            response.set_cookie(access.cookie_name, access.session, httponly=True,
                                samesite="strict", secure=request.url.scheme == "https")
        else:
            response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        ws_source = ""
        if access.allowed_host(request):
            ws_scheme = "wss" if request.url.scheme == "https" else "ws"
            ws_source = f" {ws_scheme}://{request.headers['host']}"
        response.headers["Content-Security-Policy"] = (
            f"default-src 'self'; connect-src 'self'{ws_source}; "
            "img-src 'self' blob: data:; object-src 'none'; frame-ancestors 'none'; "
            "base-uri 'none'; form-action 'self'"
        )
        return response

    @app.get("/", response_class=HTMLResponse, include_in_schema=False)
    async def index() -> HTMLResponse:
        html = (package_dir / "templates" / "index.html").read_text(encoding="utf-8")
        return HTMLResponse(html, headers={"Cache-Control": "no-store"})

    @app.get("/api/config")
    async def capabilities() -> dict[str, int | bool]:
        return {"max_text_size": config.clipboard.max_text_size,
                "max_upload_size": config.share.max_upload_size,
                "read_only": config.share.read_only,
                "private_link": config.security.token is not None}

    def require_writable() -> None:
        if config.share.read_only:
            raise HTTPException(status_code=403, detail="files are read-only")

    @app.get("/api/files", response_model=DirectoryListing)
    async def list_files(path: str = Query(default="")) -> DirectoryListing:
        try:
            return manager.list_directory(path)
        except (SecurityError, FileNotFoundError, NotADirectoryError, OSError) as exc:
            raise _http_error(exc) from exc

    @app.post("/api/directories", status_code=201)
    async def create_directory(body: DirectoryCreate) -> dict[str, str]:
        require_writable()
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
        require_writable()
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
        if not access.allowed_host(websocket) or not same_origin(websocket) or not access.authorized(websocket):
            await websocket.close(code=1008, reason="access denied")
            return
        await hub.handle(websocket)

    return app
