from pathlib import Path

from fastapi.testclient import TestClient

from sharedserver.config import AppConfig, ShareConfig
from sharedserver.server import create_app


def client_for(directory: Path, max_size: int = 1024) -> TestClient:
    config = AppConfig(share=ShareConfig(directory=directory, max_upload_size=max_size))
    return TestClient(create_app(config))


def test_upload_list_download_and_no_overwrite(tmp_path: Path) -> None:
    with client_for(tmp_path) as client:
        response = client.put(
            "/api/upload",
            params={"path": "", "filename": "hello.txt"},
            content=b"hello LAN",
        )
        assert response.status_code == 201
        assert response.json() == {"name": "hello.txt", "path": "hello.txt", "size": 9}

        listing = client.get("/api/files").json()
        assert listing["path"] == ""
        assert listing["parent"] is None
        assert listing["entries"][0]["copy_kind"] == "text"
        assert client.get("/api/download", params={"path": "hello.txt"}).content == b"hello LAN"
        assert client.get("/api/text", params={"path": "hello.txt"}).json() == {
            "content": "hello LAN"
        }
        assert client.put(
            "/api/upload",
            params={"filename": "hello.txt"},
            content=b"replacement",
        ).status_code == 409
        assert (tmp_path / "hello.txt").read_bytes() == b"hello LAN"


def test_upload_limit_and_path_escape(tmp_path: Path) -> None:
    with client_for(tmp_path, max_size=4) as client:
        assert client.put(
            "/api/upload", params={"filename": "large.bin"}, content=b"12345"
        ).status_code == 413
        assert not (tmp_path / "large.bin").exists()
        assert client.get("/api/files", params={"path": "../"}).status_code == 403


def test_websocket_synchronizes_shared_text(tmp_path: Path) -> None:
    with client_for(tmp_path) as client:
        with client.websocket_connect("/ws") as first, client.websocket_connect("/ws") as second:
            assert first.receive_json() == {"type": "clipboard", "content": ""}
            assert second.receive_json() == {"type": "clipboard", "content": ""}
            first.send_json({"type": "clipboard", "content": "hello"})
            assert first.receive_json()["content"] == "hello"
            assert second.receive_json()["content"] == "hello"
