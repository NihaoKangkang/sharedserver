from __future__ import annotations

import re
import unicodedata
from pathlib import Path, PurePosixPath, PureWindowsPath


class SecurityError(ValueError):
    """Raised when user input attempts to escape the shared directory."""


WINDOWS_RESERVED = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{number}" for number in range(1, 10)),
    *(f"LPT{number}" for number in range(1, 10)),
}
INVALID_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def resolve_within(root: Path, supplied: str = "", *, must_exist: bool = True) -> Path:
    root = root.resolve(strict=True)
    if "\x00" in supplied:
        raise SecurityError("path contains a null byte")

    normalized = supplied.replace("\\", "/")
    posix_path = PurePosixPath(normalized)
    windows_path = PureWindowsPath(supplied)
    if posix_path.is_absolute() or windows_path.is_absolute() or windows_path.drive:
        raise SecurityError("absolute paths are not allowed")
    if ".." in posix_path.parts:
        raise SecurityError("parent path segments are not allowed")

    try:
        candidate = (root / Path(*posix_path.parts)).resolve(strict=must_exist)
        candidate.relative_to(root)
    except (OSError, ValueError) as exc:
        raise SecurityError("path is outside the shared directory") from exc
    return candidate


def sanitize_filename(raw_name: str) -> str:
    name = unicodedata.normalize("NFC", raw_name.replace("\\", "/").split("/")[-1])
    name = INVALID_FILENAME_CHARS.sub("_", name).strip().rstrip(". ")
    if name in {"", ".", ".."}:
        name = "upload"
    if name.split(".", 1)[0].upper() in WINDOWS_RESERVED:
        name = f"_{name}"
    while len(name.encode("utf-8")) > 240:
        name = name[:-1]
    return name

