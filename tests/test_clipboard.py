from pathlib import Path

import pytest

from sharedserver.clipboard import ClipboardPolicy
from sharedserver.config import ClipboardConfig


def test_copy_kind_uses_strict_case_insensitive_whitelists() -> None:
    policy = ClipboardPolicy(
        ClipboardConfig(text_extensions=(".txt", ".py"), image_extensions=(".png",))
    )

    assert policy.copy_kind(Path("notes.TXT")) == "text"
    assert policy.copy_kind(Path("photo.PNG")) == "image"
    assert policy.copy_kind(Path("archive.zip")) is None
    assert policy.copy_kind(Path("script.py.exe")) is None


def test_text_reader_rejects_non_whitelisted_and_oversized_files(tmp_path: Path) -> None:
    policy = ClipboardPolicy(
        ClipboardConfig(
            text_extensions=(".txt",), image_extensions=(), max_text_size=4
        )
    )
    binary = tmp_path / "data.bin"
    binary.write_bytes(b"ok")
    large = tmp_path / "large.txt"
    large.write_text("12345", encoding="utf-8")

    with pytest.raises(ValueError, match="not allowed"):
        policy.read_text(binary)
    with pytest.raises(ValueError, match="too large"):
        policy.read_text(large)


def test_text_reader_replaces_malformed_utf8(tmp_path: Path) -> None:
    policy = ClipboardPolicy(
        ClipboardConfig(text_extensions=(".txt",), image_extensions=())
    )
    damaged = tmp_path / "damaged.txt"
    damaged.write_bytes(b"before\xe2\nafter")

    assert policy.read_text(damaged) == "before\ufffd\nafter"
