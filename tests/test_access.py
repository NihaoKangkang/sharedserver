from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from sharedserver.config import AppConfig, SecurityConfig, ShareConfig, load_config
from sharedserver.server import create_app

TOKEN = "a-private-link-for-tests"


def client_for(path: Path, *, token: str | None = TOKEN, read_only: bool = False):
    return TestClient(create_app(AppConfig(
        share=ShareConfig(directory=path, read_only=read_only),
        security=SecurityConfig(token=token),
    )), base_url="http://127.0.0.1")


def test_token_guards_every_endpoint_and_websocket(tmp_path):
    (tmp_path / "sample.txt").write_text("secret")
    with client_for(tmp_path) as client:
        for url in ("/", "/static/app.js", "/api/config", "/api/files",
                    "/api/download?path=sample.txt", "/api/text?path=sample.txt", "/api/image?path=sample.txt"):
            assert client.get(url).status_code == 403
        assert client.put("/api/upload?filename=bad.txt", content=b"bad").status_code == 403
        assert client.post("/api/directories", json={"name": "bad"}).status_code == 403
        assert client.get("/", params={"token": "wrong"}).status_code == 403
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("ws://127.0.0.1/ws"):
                pass
        assert not (tmp_path / "bad.txt").exists()


def test_private_link_bootstraps_clean_cookie_session(tmp_path):
    with client_for(tmp_path) as client:
        response = client.get("/", params={"token": TOKEN}, follow_redirects=False)
        assert response.status_code == 303
        assert response.headers["location"] == "/"
        assert "HttpOnly" in response.headers["set-cookie"]
        assert "SameSite=strict" in response.headers["set-cookie"]
        assert TOKEN not in response.headers["set-cookie"]
        assert client.get("/").status_code == 200
        assert TOKEN not in client.get("/api/config").text
        assert client.put("/api/upload?filename=ok.txt", content=b"ok").status_code == 201
        assert client.get("/api/download?path=ok.txt").content == b"ok"
        with client.websocket_connect("ws://127.0.0.1/ws") as ws:
            assert ws.receive_json()["content"] == ""
        client.cookies.clear()
        assert client.get("/api/files").status_code == 403
        assert client.get("/api/files", headers={"Authorization": f"Bearer {TOKEN}"}).status_code == 200
        assert client.get("/api/files", params={"token": "\u00e9"}).status_code == 403


def test_restart_invalidates_browser_session(tmp_path):
    with client_for(tmp_path) as first, client_for(tmp_path) as second:
        first.get("/", params={"token": TOKEN})
        second.cookies.update(first.cookies)
        assert second.get("/api/files").status_code == 403


@pytest.mark.parametrize("headers", [
    {"Origin": "http://evil.example"},
    {"Origin": "null"},
    {"Origin": "https://127.0.0.1"},
    {"Host": "evil.example"},
    {"Sec-Fetch-Site": "cross-site"},
])
def test_host_and_origin_guards_apply_without_token(tmp_path, headers):
    with client_for(tmp_path, token=None) as client:
        assert client.get("/api/files", headers=headers).status_code == 403
        assert client.put("/api/upload?filename=blocked.txt", content=b"bad", headers=headers).status_code == 403
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("ws://127.0.0.1/ws", headers=headers):
                pass


def test_same_origin_and_read_only_files(tmp_path):
    (tmp_path / "ok.txt").write_text("ok")
    with client_for(tmp_path, token=None, read_only=True) as client:
        assert client.get("/api/files", headers={"Origin": "http://127.0.0.1"}).status_code == 200
        assert client.get("/api/config").json()["read_only"] is True
        assert client.get("/api/download?path=ok.txt").content == b"ok"
        assert client.put("/api/upload?filename=no.txt", content=b"no").status_code == 403
        assert client.post("/api/directories", json={"name": "no"}).status_code == 403
        with client.websocket_connect("ws://127.0.0.1/ws") as ws:
            ws.receive_json()
            ws.send_json({"type": "clipboard", "content": "still editable"})
            assert ws.receive_json()["type"] == "ack"


def test_hidden_files_config_and_internal_symlinks_are_private(tmp_path):
    (tmp_path / ".env").write_text("secret")
    (tmp_path / ".git").mkdir()
    (tmp_path / ".git" / "config").write_text("secret")
    (tmp_path / "public.txt").write_text("public")
    config_file = tmp_path / "custom.yaml"
    config_file.write_text(f"security:\n  token: {TOKEN}\n")
    config = load_config(config_file)
    with TestClient(create_app(config), base_url="http://127.0.0.1") as client:
        client.get("/", params={"token": TOKEN})
        assert [entry["name"] for entry in client.get("/api/files").json()["entries"]] == ["public.txt"]
        for name in (".env", ".git/config", "custom.yaml"):
            assert client.get("/api/download", params={"path": name}).status_code == 403
        assert client.put("/api/upload?filename=.env", content=b"oops").status_code == 403
    try:
        (tmp_path / "link.txt").symlink_to(tmp_path / "public.txt")
        (tmp_path / "linkdir").symlink_to(tmp_path, target_is_directory=True)
    except OSError:
        pytest.skip("symlinks not available")
    with client_for(tmp_path, token=None) as client:
        for name in ("link.txt", "linkdir/public.txt"):
            assert client.get("/api/download", params={"path": name}).status_code == 403


@pytest.mark.parametrize("host", ["user@127.0.0.1", "127.0.0.1:bad", "127.0.0.1:65536", "127.0.0.1/path"])
def test_malformed_hosts_cannot_enter_csp(tmp_path, host):
    with client_for(tmp_path, token=None) as client:
        assert client.get("/", headers={"Host": host}).status_code == 403
