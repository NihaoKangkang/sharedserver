import asyncio
import base64
import io
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from sharedserver.config import AppConfig, ClipboardConfig, SecurityConfig, ShareConfig
from sharedserver.server import create_app


def make_client(folder, *, mode="full", security=None, limit=1024, rename=False):
    return TestClient(create_app(AppConfig(share=ShareConfig(directory=folder, mode=mode,
                                                           max_upload_size=limit, rename_on_conflict=rename),
                                           security=security or SecurityConfig(),
                                           clipboard=ClipboardConfig(max_text_size=8))), base_url="http://127.0.0.1")


def test_basic_auth_covers_http_and_browser_websocket_session(tmp_path):
    with make_client(tmp_path, security=SecurityConfig(auth="owner:secret")) as client:
        response = client.get("/")
        assert response.status_code == 401
        assert 'Basic realm=' in response.headers["www-authenticate"]
        assert client.get("/api/config", auth=("owner", "wrong")).status_code == 401
        assert client.get("/", auth=("owner", "secret")).status_code == 200
        with client.websocket_connect("ws://127.0.0.1/ws") as ws:
            assert ws.receive_json()["content"] == ""
        client.cookies.clear()
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("ws://127.0.0.1/ws"):
                pass
        assert client.put("/upload/test.txt", content=b"ok", auth=("owner", "secret")).status_code == 201


def test_pin_bootstrap_and_bounded_attempts(tmp_path):
    with make_client(tmp_path, security=SecurityConfig(pin="123456")) as client:
        assert client.get("/", params={"pin": "123456"}).status_code == 200
        assert client.get("/api/config").status_code == 200
        client.cookies.clear()
        for _ in range(5):
            assert client.get("/", params={"pin": "wrong"}).status_code == 403
        assert client.get("/", params={"pin": "123456"}).status_code == 429


def test_random_path_protects_all_routes_and_combines_with_token(tmp_path):
    secret = "a-long-random-path-secret"
    token = "another-long-random-token"
    prefix = "/s/" + secret
    with make_client(tmp_path, security=SecurityConfig(random_path=secret, token=token)) as client:
        for path in ("/", "/api/files", "/static/app.js", "/api/clipboard/raw"):
            assert client.get(path).status_code == 404
        response = client.get(prefix + "/?token=" + token, follow_redirects=False)
        assert response.status_code == 303
        assert response.headers["location"] == prefix + "/"
        assert f"Path={prefix}/" in response.headers["set-cookie"]
        assert client.get(prefix + "/").status_code == 200
        assert client.get(prefix + "/static/app.js").status_code == 200
        assert client.get(prefix + "/api/files").status_code == 200
        with client.websocket_connect("ws://127.0.0.1" + prefix + "/ws") as ws:
            assert ws.receive_json()["content"] == ""


@pytest.mark.parametrize("mode", ["readonly", "droponly"])
def test_permission_modes_cover_http_and_websockets(tmp_path, mode):
    (tmp_path / "existing.txt").write_text("history")
    with make_client(tmp_path, mode=mode) as client:
        hub = client.app.state.clipboard_hub
        hub.content = "history"
        if mode == "readonly":
            assert client.get("/api/clipboard/raw").text == "history"
            for path in ("/upload/new.txt", "/api/upload?filename=new.txt"):
                assert client.put(path, content=b"new").status_code == 403
            assert client.post("/api/clipboard/raw", content=b"new").status_code == 403
            assert client.get("/api/download?path=existing.txt").content == b"history"
        else:
            for path in ("/api/files", "/api/download?path=existing.txt", "/api/text?path=existing.txt",
                         "/api/image?path=existing.txt", "/api/clipboard/raw"):
                assert client.get(path).status_code == 403
            assert client.post("/api/zip", json={"paths": ["existing.txt"]}).status_code == 403
            assert client.put("/api/upload?path=unknown&filename=new.txt", content=b"x").status_code == 403
            assert client.post("/api/clipboard/raw", content=b"new").status_code == 200
            assert client.put("/upload/new.txt", content=b"new").status_code == 201
        assert client.post("/api/directories", json={"name": "folder"}).status_code == 403
        with client.websocket_connect("ws://127.0.0.1/ws") as first, client.websocket_connect("ws://127.0.0.1/ws") as second:
            snapshot = first.receive_json()
            second.receive_json()
            assert snapshot["content"] == ("history" if mode == "readonly" else "")
            first.send_json({"type": "clipboard", "content": "change"})
            assert first.receive_json()["type"] == ("error" if mode == "readonly" else "ack")
            if mode == "droponly":
                # A new client must not see a previous sender's submission.
                with client.websocket_connect("ws://127.0.0.1/ws") as third:
                    assert third.receive_json()["content"] == ""


def test_raw_text_api_broadcasts_and_limits_utf8(tmp_path):
    with make_client(tmp_path) as client, client.websocket_connect("ws://127.0.0.1/ws") as ws:
        ws.receive_json()
        assert client.post("/api/clipboard/raw", content="hello").text == "OK\n"
        assert ws.receive_json()["content"] == "hello"
        response = client.get("/api/clipboard/raw")
        assert response.text == "hello"
        assert response.headers["content-type"] == "text/plain; charset=utf-8"
        assert client.post("/api/clipboard/raw", content=b"123456789").status_code == 413
        assert client.post("/api/clipboard/raw", content=b"\xff").status_code == 400
        assert client.get("/api/clipboard/raw").text == "hello"


def test_cli_upload_range_head_and_no_overwrite(tmp_path):
    with make_client(tmp_path) as client:
        assert client.put("/upload/data.bin", content=b"0123456789", headers={"User-Agent": "curl/8.0"}).text == "OK: data.bin uploaded\n"
        assert client.put("/upload/data.bin", content=b"bad").status_code == 409
        response = client.get("/api/download?path=data.bin", headers={"Range": "bytes=2-5"})
        assert response.status_code == 206
        assert response.content == b"2345"
        assert response.headers["content-range"] == "bytes 2-5/10"
        assert client.get("/api/download?path=data.bin", headers={"Range": "bytes=-2"}).content == b"89"
        assert client.get("/api/download?path=data.bin", headers={"Range": "bytes=30-40"}).status_code == 416
        assert client.head("/api/download?path=data.bin").content == b""
        assert client.get("/api/download?path=data.bin").headers["accept-ranges"] == "bytes"


def test_unlimited_upload_and_safe_numbered_conflicts(tmp_path):
    with make_client(tmp_path, limit=0, rename=True) as client:
        for expected in ("report.txt", "report (1).txt", "report (2).txt"):
            response = client.put("/api/upload?filename=report.txt", content=b"x" * 2000)
            assert response.status_code == 201
            assert response.json()["name"] == expected
        assert (tmp_path / "report.txt").stat().st_size == 2000


def test_zip_selection_streams_contents_and_rejects_traversal(tmp_path):
    (tmp_path / "one.txt").write_text("one")
    (tmp_path / "two.txt").write_text("two")
    with make_client(tmp_path) as client:
        response = client.post("/api/zip", json={"paths": ["one.txt", "two.txt", "one.txt"]})
        assert response.status_code == 200
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            assert archive.namelist() == ["one.txt", "two.txt"]
            assert archive.read("two.txt") == b"two"
        assert client.post("/api/zip", json={"paths": ["../outside.txt"]}).status_code == 403
        assert client.post("/api/zip", json={"paths": []}).status_code == 422
        assert client.post("/api/zip", json={"paths": ["one.txt"] * 201}).status_code == 422


def test_images_are_validated_and_synchronized_without_inlining_active_files(tmp_path):
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jqMcAAAAASUVORK5CYII=")
    with make_client(tmp_path) as client, client.websocket_connect("ws://127.0.0.1/ws") as ws:
        ws.receive_json()
        assert client.put("/api/upload?filename=photo.png", content=png).status_code == 201
        assert ws.receive_json() == {"type": "image", "path": "photo.png"}
        assert client.get("/api/image?path=photo.png").headers["content-type"] == "image/png"
        for name in ("bad.png", "evil.svg", "evil.html", "evil.js"):
            (tmp_path / name).write_text("<script>alert(1)</script>")
            assert client.get("/api/image", params={"path": name}).status_code == 400
            response = client.get("/api/download", params={"path": name})
            assert response.headers["content-disposition"].startswith("attachment;")
            assert response.headers["x-content-type-options"] == "nosniff"


def test_inbox_text_is_persisted_and_duplicate_submissions_are_kept(tmp_path):
    with make_client(tmp_path, mode="droponly") as client:
        for _ in range(2):
            assert client.post("/api/clipboard/raw", content=b"same").status_code == 200
        with client.websocket_connect("ws://127.0.0.1/ws") as ws:
            assert ws.receive_json()["content"] == ""
            ws.send_json({"type": "clipboard", "content": "ws text"})
            assert ws.receive_json()["type"] == "ack"
        submissions = sorted(path.read_text() for path in tmp_path.glob("text_*.txt"))
        assert submissions == ["same", "same", "ws text"]
        assert client.get("/api/files").status_code == 403


def test_native_zip_form_and_unicode_numbering(tmp_path):
    name = "\u4e2d" * 60 + ".txt"
    with make_client(tmp_path, rename=True) as client:
        first = client.put("/api/upload", params={"filename": name}, content=b"one").json()
        second = client.put("/api/upload", params={"filename": name}, content=b"two").json()
        assert first["name"] != second["name"]
        assert " (1).txt" in second["name"]
        assert len(second["name"].encode("utf-8")) <= 240
        response = client.post("/api/zip", content="path=" + first["name"],
                               headers={"Content-Type": "application/x-www-form-urlencoded", "Origin": "http://127.0.0.1"})
        assert response.status_code == 200
        assert response.headers["referrer-policy"] == "same-origin"
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            assert archive.read(name) == b"one"


def test_raw_chunked_text_limit_preserves_last_value(tmp_path):
    def chunks():
        yield b"12345"
        yield b"6789"
    with make_client(tmp_path) as client:
        client.post("/api/clipboard/raw", content=b"old")
        assert client.post("/api/clipboard/raw", content=chunks()).status_code == 413
        assert client.get("/api/clipboard/raw").text == "old"
