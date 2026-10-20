"""ZIP output is staged on disk and removed even when a download disconnects."""
from __future__ import annotations

import shutil
import zipfile
from pathlib import Path

from starlette.responses import FileResponse

from .file_manager import FileManager


def write_archive(manager: FileManager, paths: list[str], destination: Path) -> None:
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_STORED,
                         allowZip64=True, strict_timestamps=False) as archive:
        for relative in dict.fromkeys(paths):
            file = manager.regular_file(relative)
            # Use validated root-relative paths; never use a raw client ZIP name.
            info = zipfile.ZipInfo.from_file(file, arcname=manager.relative(file), strict_timestamps=False)
            with file.open("rb") as source, archive.open(info, "w", force_zip64=True) as target:
                shutil.copyfileobj(source, target, 65536)


class TemporaryArchiveResponse(FileResponse):
    async def __call__(self, scope, receive, send):
        try:
            await super().__call__(scope, receive, send)
        finally:
            Path(self.path).unlink(missing_ok=True)
