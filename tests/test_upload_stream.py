import asyncio

import pytest

from sharedserver.clipboard import ClipboardPolicy
from sharedserver.config import ClipboardConfig
from sharedserver.file_manager import FileManager, UploadTooLargeError


def test_stream_limit_without_content_length_removes_partial_upload(tmp_path):
    manager = FileManager(tmp_path, 4, ClipboardPolicy(ClipboardConfig()))

    async def chunks():
        yield b"123"
        yield b"45"

    with pytest.raises(UploadTooLargeError):
        asyncio.run(manager.save_upload("", "large.bin", chunks()))
    assert list(tmp_path.iterdir()) == []


def test_interrupted_stream_cleans_up_temporary_file(tmp_path):
    manager = FileManager(tmp_path, 1024, ClipboardPolicy(ClipboardConfig()))

    async def chunks():
        yield b"partial"
        raise ConnectionError("device disconnected")

    with pytest.raises(ConnectionError):
        asyncio.run(manager.save_upload("", "incomplete.bin", chunks()))
    assert list(tmp_path.iterdir()) == []


def test_cancelled_stream_cleans_up(tmp_path):
    manager = FileManager(tmp_path, 1024, ClipboardPolicy(ClipboardConfig()))
    async def chunks():
        yield b"partial"
        raise asyncio.CancelledError
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(manager.save_upload("", "cancelled.bin", chunks()))
    assert list(tmp_path.iterdir()) == []


def test_no_hardlink_fallback_hides_partial_destination(monkeypatch, tmp_path):
    import shutil
    import sharedserver.file_manager as files
    manager = FileManager(tmp_path, 1024, ClipboardPolicy(ClipboardConfig()))
    original_copy = shutil.copyfileobj
    monkeypatch.setattr(files.os, "link", lambda *args: (_ for _ in ()).throw(OSError("not supported")))
    def inspect_copy(source, target, length):
        assert manager.list_directory().entries == []
        assert tmp_path / "complete.bin" in manager.pending
        original_copy(source, target, length)
    monkeypatch.setattr(files.shutil, "copyfileobj", inspect_copy)
    async def chunks():
        yield b"complete"
    asyncio.run(manager.save_upload("", "complete.bin", chunks()))
    assert (tmp_path / "complete.bin").read_bytes() == b"complete"
    assert manager.pending == set()
