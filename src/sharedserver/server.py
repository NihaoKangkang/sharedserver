from __future__ import annotations

import tempfile
import secrets
from datetime import datetime, timezone
from urllib.parse import parse_qs
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from pydantic import ValidationError

from . import __version__
from .access import AccessPolicy, same_origin
from .archives import TemporaryArchiveResponse, write_archive
from .clipboard import ClipboardPolicy
from .config import AppConfig
from .file_manager import FileManager, UploadTooLargeError
from .models import DirectoryCreate, DirectoryListing, ImageSelection, TextContent, UploadResult, ZipSelection
from .security import SecurityError
from .websocket import ClipboardHub


def _http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, SecurityError):
        return HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, (FileNotFoundError, NotADirectoryError)):
        return HTTPException(status_code=404, detail="file or directory not found")
    if isinstance(exc, FileExistsError):
        return HTTPException(status_code=409, detail="name already exists; use --rename-on-conflict to keep both")
    if isinstance(exc, UploadTooLargeError):
        return HTTPException(status_code=413, detail=str(exc))
    return HTTPException(status_code=400, detail=str(exc))


async def bounded_text(request: Request, limit: int) -> str:
    content = bytearray()
    async for chunk in request.stream():
        if len(content) + len(chunk) > limit:
            raise HTTPException(status_code=413, detail=f"text exceeds {limit} UTF-8 bytes")
        content.extend(chunk)
    try:
        return content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="clipboard requires UTF-8 text") from exc


def create_app(config: AppConfig) -> FastAPI:
    package_dir = Path(__file__).parent
    policy = ClipboardPolicy(config.clipboard)
    manager = FileManager(config.share.directory, config.share.max_upload_size, policy,
                          (config.config_file,) if config.config_file else (), config.share.rename_on_conflict)
    text_manager = FileManager(config.share.directory, config.clipboard.max_text_size, policy)

    async def store_submission(content: str) -> None:
        if not content:
            return
        name = f"text_{datetime.now(timezone.utc):%Y%m%d_%H%M%S}_{secrets.token_hex(8)}.txt"
        async def chunks():
            data = content.encode("utf-8")
            for offset in range(0, len(data), 65536):
                yield data[offset:offset + 65536]
        await text_manager.save_upload("", name, chunks())

    hub = ClipboardHub(config.clipboard.max_text_size, can_read=config.share.can_read,
                       can_write=config.share.can_write_text,
                       on_text=store_submission if config.share.mode == "droponly" else None)
    access = AccessPolicy(config)
    app = FastAPI(title="SharedServer", version=__version__, docs_url=None,
                  redoc_url=None, openapi_url=None)
    app.state.config = config
    app.state.file_manager = manager
    app.state.clipboard_hub = hub
    app.mount("/static", StaticFiles(directory=package_dir / "static"), name="static")

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        root_url = access.prefix + "/"
        if not access.allowed_host(request) or not same_origin(request):
            response = JSONResponse({"detail": "host or origin not allowed"}, status_code=403)
        elif not access.authorized(request):
            throttled = access.pin_throttled(request, failed=True)
            response = JSONResponse(
                {"detail": "Too many PIN attempts; retry in 60 seconds." if throttled else
                 "Access denied. Use the private link/PIN in the terminal or the configured Basic credentials."},
                status_code=429 if throttled else 401 if access.auth else 403,
                headers={"WWW-Authenticate": 'Basic realm="SharedServer", charset="UTF-8"'} if access.auth else {},
            )
        else:
            if access.protected and request.url.path == root_url and any(
                    key in request.query_params for key in ("token", "pin")):
                response = RedirectResponse(root_url, status_code=303)
            else:
                response = await call_next(request)
            if access.protected and request.url.path == root_url:
                response.set_cookie(access.cookie_name, access.session, path=root_url, httponly=True,
                                    samesite="strict", secure=request.url.scheme == "https")
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        # no-referrer makes Chromium serialize a native POST form's Origin as
        # null. Keep cross-origin referrers private while preserving CSRF checks.
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Cache-Control"] = "no-store"
        ws_source = ""
        if access.allowed_host(request):
            scheme = "wss" if request.url.scheme == "https" else "ws"
            ws_source = f" {scheme}://{request.headers['host']}"
        response.headers["Content-Security-Policy"] = (
            f"default-src 'self'; connect-src 'self'{ws_source}; "
            "img-src 'self' blob: data:; object-src 'none'; frame-ancestors 'none'; "
            "base-uri 'none'; form-action 'self'"
        )
        return response

    def require_read() -> None:
        if not config.share.can_read:
            raise HTTPException(status_code=403, detail="drop-only mode does not reveal existing content")

    def require_upload() -> None:
        if not config.share.can_upload:
            raise HTTPException(status_code=403, detail="files are read-only")

    def require_text_write() -> None:
        if not config.share.can_write_text:
            raise HTTPException(status_code=403, detail="shared text is read-only")

    @app.get("/", response_class=HTMLResponse, include_in_schema=False)
    async def index() -> HTMLResponse:
        return HTMLResponse((package_dir / "templates" / "index.html").read_text(encoding="utf-8"))

    @app.get("/api/config")
    async def capabilities() -> dict[str, int | bool | str]:
        return {"max_text_size": config.clipboard.max_text_size, "max_upload_size": config.share.max_upload_size,
                "read_only": not config.share.can_upload, "mode": config.share.mode,
                "can_read": config.share.can_read, "can_upload": config.share.can_upload,
                "can_write_text": config.share.can_write_text, "private_link": access.protected,
                "rename_on_conflict": config.share.rename_on_conflict}

    @app.get("/api/files", response_model=DirectoryListing)
    async def list_files(path: str = Query(default="")) -> DirectoryListing:
        require_read()
        try:
            return await run_in_threadpool(manager.list_directory, path)
        except (ValueError, OSError) as exc:
            raise _http_error(exc) from exc

    @app.post("/api/directories", status_code=201)
    async def create_directory(body: DirectoryCreate) -> dict[str, str]:
        require_read()
        require_upload()
        try:
            return {"path": await run_in_threadpool(manager.create_directory, body.path, body.name)}
        except (ValueError, OSError) as exc:
            raise _http_error(exc) from exc

    async def save_upload(request: Request, path: str, filename: str) -> UploadResult:
        require_upload()
        # Drop-only senders can write to the inbox root, not probe subdirectories.
        if not config.share.can_read and path:
            raise HTTPException(status_code=403, detail="drop-only uploads must use the inbox root")
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                length = int(content_length)
                if length < 0:
                    raise ValueError
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="invalid Content-Length") from exc
            if config.share.max_upload_size and length > config.share.max_upload_size:
                raise HTTPException(status_code=413, detail="upload is too large")
        try:
            result = await manager.save_upload(path, filename, request.stream())
            file = manager.regular_file(result.path)
            if policy.copy_kind(file) == "image":
                try:
                    await run_in_threadpool(policy.image_media_type, file)
                except ValueError:
                    pass  # A file upload is still valid even when it is not a decodable image.
                else:
                    await hub.update_image(result.path)
            return result
        except (ValueError, OSError) as exc:
            raise _http_error(exc) from exc

    @app.put("/api/upload", response_model=UploadResult, status_code=201)
    async def upload(request: Request, path: str = Query(default=""),
                     filename: str = Query(min_length=1, max_length=1024)) -> UploadResult:
        return await save_upload(request, path, filename)

    @app.put("/upload/{filename:path}", status_code=201)
    async def cli_upload(request: Request, filename: str):
        if not filename or len(filename) > 1024:
            raise HTTPException(status_code=400, detail="filename must have 1-1024 characters")
        result = await save_upload(request, "", filename)
        if any(agent in request.headers.get("user-agent", "").casefold() for agent in ("curl", "wget")):
            return PlainTextResponse(f"OK: {result.name} uploaded\n", status_code=201)
        return result

    @app.api_route("/api/download", methods=["GET", "HEAD"])
    async def download(path: str = Query(min_length=1)) -> FileResponse:
        require_read()
        try:
            file = manager.regular_file(path)
            return FileResponse(file, filename=file.name)
        except (ValueError, OSError) as exc:
            raise _http_error(exc) from exc

    @app.post("/api/zip")
    async def download_zip(request: Request) -> FileResponse:
        require_read()
        try:
            content = await bounded_text(request, 256 * 1024)
            media_type = request.headers.get("content-type", "").split(";", 1)[0]
            if media_type == "application/json":
                body = ZipSelection.model_validate_json(content)
            elif media_type == "application/x-www-form-urlencoded":
                fields = parse_qs(content, keep_blank_values=True, strict_parsing=True, max_num_fields=200)
                if set(fields) != {"path"}:
                    raise ValueError("expected selected paths")
                body = ZipSelection(paths=fields["path"])
            else:
                raise HTTPException(status_code=415, detail="use JSON or a URL-encoded path form")
        except (ValueError, ValidationError) as exc:
            raise HTTPException(status_code=422, detail="select 1-200 files") from exc
        # Named before dispatch so failure/cancellation can always clean the file.
        with tempfile.NamedTemporaryFile(prefix=".sharedserver-zip-", suffix=".zip", delete=False) as temporary:
            destination = Path(temporary.name)
        try:
            await run_in_threadpool(write_archive, manager, body.paths, destination)
        except BaseException as exc:
            destination.unlink(missing_ok=True)
            if isinstance(exc, (ValueError, OSError)):
                raise _http_error(exc) from exc
            raise
        return TemporaryArchiveResponse(destination, filename="sharedserver-selection.zip", media_type="application/zip")

    @app.get("/api/text", response_model=TextContent)
    async def text_content(path: str = Query(min_length=1)) -> TextContent:
        require_read()
        try:
            return TextContent(content=await run_in_threadpool(policy.read_text, manager.regular_file(path)))
        except (ValueError, OSError) as exc:
            raise _http_error(exc) from exc

    @app.get("/api/image")
    async def image_content(path: str = Query(min_length=1)) -> FileResponse:
        require_read()
        try:
            file = manager.regular_file(path)
            media_type = await run_in_threadpool(policy.image_media_type, file)
            return FileResponse(file, media_type=media_type)
        except (ValueError, OSError) as exc:
            raise _http_error(exc) from exc

    @app.post("/api/clipboard/image", status_code=204)
    async def share_image(body: ImageSelection) -> None:
        require_read()
        require_text_write()
        try:
            await run_in_threadpool(policy.image_media_type, manager.regular_file(body.path))
            await hub.update_image(body.path)
        except (ValueError, OSError) as exc:
            raise _http_error(exc) from exc

    @app.get("/api/clipboard/raw", response_class=PlainTextResponse)
    async def get_raw_clipboard() -> str:
        require_read()
        return hub.content

    @app.post("/api/clipboard/raw", response_class=PlainTextResponse)
    async def set_raw_clipboard(request: Request) -> str:
        require_text_write()
        try:
            await hub.update_text(await bounded_text(request, config.clipboard.max_text_size))
        except (ValueError, OSError) as exc:
            raise _http_error(exc) from exc
        return "OK\n"

    @app.websocket("/ws")
    async def clipboard_socket(websocket: WebSocket) -> None:
        if not access.allowed_host(websocket) or not same_origin(websocket) or not access.authorized(websocket):
            access.pin_throttled(websocket, failed=True)
            await websocket.close(code=1008, reason="access denied")
            return
        await hub.handle(websocket)

    if access.prefix:
        outer = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
        outer.mount(access.prefix, app)
        outer.state.config = config
        outer.state.file_manager = manager
        outer.state.clipboard_hub = hub
        return outer
    return app
