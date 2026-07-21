from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class FileEntry(BaseModel):
    name: str
    path: str
    is_directory: bool
    size: int | None
    modified: str
    copy_kind: Literal["text", "image"] | None = None


class DirectoryListing(BaseModel):
    path: str
    parent: str | None
    entries: list[FileEntry]


class DirectoryCreate(BaseModel):
    path: str = ""
    name: str = Field(min_length=1, max_length=255)


class ClipboardUpdate(BaseModel):
    type: Literal["clipboard"]
    content: str = Field(max_length=1_000_000)


class TextContent(BaseModel):
    content: str


class UploadResult(BaseModel):
    name: str
    path: str
    size: int

