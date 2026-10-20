from __future__ import annotations

from pathlib import Path
from typing import Literal

from .config import ClipboardConfig

CopyKind = Literal["text", "image"]
ACTIVE_EXTENSIONS = frozenset({".html", ".htm", ".svg", ".js", ".mjs", ".xhtml", ".xml"})


class ClipboardPolicy:
    def __init__(self, config: ClipboardConfig):
        self.text_extensions = frozenset(config.text_extensions)
        self.image_extensions = frozenset(config.image_extensions)
        self.max_text_size = config.max_text_size

    def copy_kind(self, path: Path) -> CopyKind | None:
        suffix = path.suffix.lower()
        if suffix in self.text_extensions:
            return "text"
        if suffix in self.image_extensions and suffix not in ACTIVE_EXTENSIONS:
            return "image"
        return None

    def read_text(self, path: Path) -> str:
        if self.copy_kind(path) != "text":
            raise ValueError("file type is not allowed for text copying")
        with path.open("rb") as source:
            content = source.read(self.max_text_size + 1)
        if len(content) > self.max_text_size:
            raise ValueError("text file is too large to copy")
        return content.decode("utf-8-sig", errors="replace")

    def image_media_type(self, path: Path) -> str:
        if self.copy_kind(path) != "image":
            raise ValueError("file type is not allowed for image preview")
        with path.open("rb") as source:
            header = source.read(16)
        if path.suffix.lower() == ".png" and header.startswith(b"\x89PNG\r\n\x1a\n"):
            return "image/png"
        if path.suffix.lower() in {".jpg", ".jpeg"} and header.startswith(b"\xff\xd8\xff"):
            return "image/jpeg"
        if path.suffix.lower() == ".webp" and header[:4] == b"RIFF" and header[8:12] == b"WEBP":
            return "image/webp"
        raise ValueError("file contents do not match a supported image format")
