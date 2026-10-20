from __future__ import annotations

import os
import shutil
import tempfile
import stat as stat_module
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncIterable
from starlette.concurrency import run_in_threadpool

from .clipboard import ClipboardPolicy
from .models import DirectoryListing, FileEntry, UploadResult
from .security import SecurityError, resolve_within, sanitize_filename


class UploadTooLargeError(ValueError):
    pass


class FileManager:
    def __init__(self, root: Path, max_upload_size: int, policy: ClipboardPolicy,
                 private_paths: tuple[Path, ...] = (), rename_on_conflict: bool = False):
        if not root.exists():
            raise FileNotFoundError(f"shared directory does not exist: {root}")
        if not root.is_dir():
            raise NotADirectoryError(f"shared path is not a directory: {root}")
        self.root = root.resolve(strict=True)
        self.max_upload_size = max_upload_size
        self.policy = policy
        self.private_paths = {path.resolve() for path in private_paths}
        self.rename_on_conflict = rename_on_conflict
        self.pending: set[Path] = set()

    def is_private(self, path: Path) -> bool:
        if path in self.private_paths or path in self.pending:
            return True
        for private in self.private_paths:
            try:
                if path.samefile(private):
                    return True
            except OSError:
                continue
        return False

    def path(self, relative: str, *, must_exist: bool = True) -> Path:
        path = resolve_within(self.root, relative, must_exist=must_exist)
        if self.is_private(path):
            raise SecurityError("configuration files are not shared")
        return path

    def relative(self, path: Path) -> str:
        return "" if path == self.root else path.relative_to(self.root).as_posix()

    def list_directory(self, relative: str = "") -> DirectoryListing:
        directory = self.path(relative)
        if not directory.is_dir():
            raise NotADirectoryError(relative)

        entries: list[FileEntry] = []
        for child in directory.iterdir():
            if child.is_symlink() or child.name.startswith(".") or self.is_private(child):
                continue
            try:
                stat = child.stat()
            except OSError:
                continue
            is_directory = stat_module.S_ISDIR(stat.st_mode)
            if not is_directory and not stat_module.S_ISREG(stat.st_mode):
                continue
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
        if name.startswith("."):
            raise SecurityError("hidden filenames are not allowed")
        destination = resolve_within(parent, name, must_exist=False)
        if self.is_private(destination):
            raise SecurityError("configuration files are not shared")
        destination.mkdir()
        return self.relative(destination)

    def regular_file(self, relative: str) -> Path:
        path = self.path(relative)
        if not stat_module.S_ISREG(path.stat().st_mode):
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
        if name.startswith("."):
            raise SecurityError("hidden filenames are not allowed")
        destination = resolve_within(directory, name, must_exist=False)
        if self.is_private(destination):
            raise SecurityError("configuration files are not shared")
        if not self.rename_on_conflict and (destination.exists() or destination.is_symlink()):
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
                    if self.max_upload_size and size > self.max_upload_size:
                        raise UploadTooLargeError(
                            f"upload exceeds {self.max_upload_size} bytes"
                        )
                    for offset in range(0, len(chunk), 65536):
                        await run_in_threadpool(temporary.write, chunk[offset:offset + 65536])
                await run_in_threadpool(temporary.flush)
                await run_in_threadpool(os.fsync, temporary.fileno())

            stem, suffix = Path(name).stem, Path(name).suffix
            while len(stem.encode("utf-8")) > 160:
                stem = stem[:-1]
            while len(suffix.encode("utf-8")) > 60:
                suffix = suffix[:-1]
            for number in range(10001):
                if number:
                    numbered = f"{stem} ({number}){suffix}"
                    destination = self.path(self.relative(directory / numbered), must_exist=False)
                try:
                    await run_in_threadpool(os.link, temp_path, destination)
                    break
                except FileExistsError:
                    if not self.rename_on_conflict or number == 10000:
                        raise
                    continue
                except OSError:
                    # Exclusive creation also handles filesystems without hard links.
                    try:
                        target = destination.open("xb")
                    except FileExistsError:
                        if not self.rename_on_conflict or number == 10000:
                            raise
                        continue
                    fallback_destination_created = True
                    self.pending.add(destination)
                    with temp_path.open("rb") as source, target:
                        await run_in_threadpool(shutil.copyfileobj, source, target, 65536)
                    break
            name = destination.name
            return UploadResult(name=name, path=self.relative(destination), size=size)
        except FileExistsError:
            raise
        except BaseException:
            if fallback_destination_created:
                destination.unlink(missing_ok=True)
            raise
        finally:
            self.pending.discard(destination)
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)
