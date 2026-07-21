from __future__ import annotations

import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncIterable

from .clipboard import ClipboardPolicy
from .models import DirectoryListing, FileEntry, UploadResult
from .security import SecurityError, resolve_within, sanitize_filename


class UploadTooLargeError(ValueError):
    pass


class FileManager:
    def __init__(self, root: Path, max_upload_size: int, policy: ClipboardPolicy):
        if not root.exists():
            raise FileNotFoundError(f"shared directory does not exist: {root}")
        if not root.is_dir():
            raise NotADirectoryError(f"shared path is not a directory: {root}")
        self.root = root.resolve(strict=True)
        self.max_upload_size = max_upload_size
        self.policy = policy

    def path(self, relative: str, *, must_exist: bool = True) -> Path:
        return resolve_within(self.root, relative, must_exist=must_exist)

    def relative(self, path: Path) -> str:
        return "" if path == self.root else path.relative_to(self.root).as_posix()

    def list_directory(self, relative: str = "") -> DirectoryListing:
        directory = self.path(relative)
        if not directory.is_dir():
            raise NotADirectoryError(relative)

        entries: list[FileEntry] = []
        for child in directory.iterdir():
            if child.is_symlink() or child.name.startswith(".sharedserver-"):
                continue
            try:
                stat = child.stat()
            except OSError:
                continue
            is_directory = child.is_dir()
            entries.append(
                FileEntry(
                    name=child.name,
                    path=self.relative(child),
                    is_directory=is_directory,
                    size=None if is_directory else stat.st_size,
                    modified=datetime.fromtimestamp(
                        stat.st_mtime, tz=timezone.utc
                    ).isoformat(),
                    copy_kind=None if is_directory else self.policy.copy_kind(child),
                )
            )
        entries.sort(key=lambda entry: (not entry.is_directory, entry.name.casefold()))
        current = self.relative(directory)
        parent = None if directory == self.root else self.relative(directory.parent)
        return DirectoryListing(path=current, parent=parent, entries=entries)

    def create_directory(self, relative: str, raw_name: str) -> str:
        parent = self.path(relative)
        if not parent.is_dir():
            raise NotADirectoryError(relative)
        name = sanitize_filename(raw_name)
        destination = resolve_within(parent, name, must_exist=False)
        destination.mkdir()
        return self.relative(destination)

    def regular_file(self, relative: str) -> Path:
        path = self.path(relative)
        if not path.is_file() or path.is_symlink():
            raise FileNotFoundError(relative)
        return path

    async def save_upload(
        self,
        relative: str,
        raw_name: str,
        chunks: AsyncIterable[bytes],
    ) -> UploadResult:
        directory = self.path(relative)
        if not directory.is_dir():
            raise NotADirectoryError(relative)
        name = sanitize_filename(raw_name)
        destination = resolve_within(directory, name, must_exist=False)
        if destination.exists() or destination.is_symlink():
            raise FileExistsError(name)

        size = 0
        temp_path: Path | None = None
        fallback_destination_created = False
        try:
            with tempfile.NamedTemporaryFile(
                mode="wb", prefix=".sharedserver-", dir=directory, delete=False
            ) as temporary:
                temp_path = Path(temporary.name)
                async for chunk in chunks:
                    size += len(chunk)
                    if size > self.max_upload_size:
                        raise UploadTooLargeError(
                            f"upload exceeds {self.max_upload_size} bytes"
                        )
                    temporary.write(chunk)
                temporary.flush()
                os.fsync(temporary.fileno())

            try:
                os.link(temp_path, destination)
            except FileExistsError:
                raise
            except OSError:
                # Some network and removable filesystems do not support hard links.
                with temp_path.open("rb") as source, destination.open("xb") as target:
                    fallback_destination_created = True
                    shutil.copyfileobj(source, target)
            return UploadResult(name=name, path=self.relative(destination), size=size)
        except FileExistsError:
            raise
        except Exception:
            if fallback_destination_created:
                destination.unlink(missing_ok=True)
            raise
        finally:
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)
