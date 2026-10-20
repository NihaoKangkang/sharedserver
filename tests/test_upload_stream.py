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
