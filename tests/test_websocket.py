from fastapi.testclient import TestClient

from sharedserver.config import AppConfig, ClipboardConfig, ShareConfig
from sharedserver.server import create_app


def test_text_limit_counts_utf8_and_rejects_binary_without_losing_state(tmp_path):
    config = AppConfig(share=ShareConfig(directory=tmp_path),
                       clipboard=ClipboardConfig(max_text_size=4))
    with TestClient(create_app(config), base_url="http://127.0.0.1") as client:
        with client.websocket_connect("ws://127.0.0.1/ws") as ws:
            ws.receive_json()
            ws.send_json({"type": "clipboard", "content": "\u00e9\u00e9", "id": 1})
            assert ws.receive_json() == {"type": "ack", "id": 1}
            for invalid in ({"type": "clipboard", "content": "\u00e9\u00e9x"},
                            {"type": "clipboard", "content": ["image"]},
                            {"type": "other", "content": "ok"}):
                ws.send_json(invalid)
                assert ws.receive_json()["type"] == "error"
            ws.send_bytes(b"image")
            assert ws.receive_json()["type"] == "error"
            ws.send_text("invalid JSON")
            assert ws.receive_json()["type"] == "error"
            with client.websocket_connect("ws://127.0.0.1/ws") as other:
                assert other.receive_json()["content"] == "\u00e9\u00e9"
                other.send_json({"type": "clipboard", "content": "back", "id": 2})
                assert other.receive_json() == {"type": "ack", "id": 2}
                assert ws.receive_json()["content"] == "back"


def test_duplicate_updates_are_acknowledged_without_broadcast_loop(tmp_path):
    with TestClient(create_app(AppConfig(share=ShareConfig(directory=tmp_path))),
                    base_url="http://127.0.0.1") as client:
        with client.websocket_connect("ws://127.0.0.1/ws") as first, client.websocket_connect("ws://127.0.0.1/ws") as second:
            first.receive_json()
            second.receive_json()
            first.send_json({"type": "clipboard", "content": "hello"})
            first.receive_json()
            assert second.receive_json()["content"] == "hello"
            second.send_json({"type": "clipboard", "content": "hello"})
            assert second.receive_json()["type"] == "ack"
            second.send_json({"type": "clipboard", "content": "next"})
            second.receive_json()
            assert first.receive_json()["content"] == "next"
