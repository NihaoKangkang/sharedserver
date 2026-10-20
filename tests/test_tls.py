import importlib.util
import shutil
import socket
import ssl
import threading
from pathlib import Path

import pytest

import sharedserver.cli as cli
from sharedserver.tls import certificate_names, create_certificate

pytestmark = pytest.mark.skipif(not shutil.which("openssl") and importlib.util.find_spec("cryptography") is None,
                                reason="install sharedserver[https] or OpenSSL")


def test_generated_certificate_has_verifiable_lan_san(tmp_path):
    cert, key = create_certificate(tmp_path, ["192.168.10.5", "0.0.0.0"])
    server_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    server_context.load_cert_chain(cert, key)
    client_context = ssl.create_default_context(cafile=str(cert))
    errors = []
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        listener.settimeout(5)
        def serve():
            try:
                raw, _ = listener.accept()
                with server_context.wrap_socket(raw, server_side=True) as connection:
                    connection.sendall(b"ok")
            except Exception as exc:
                errors.append(exc)
        thread = threading.Thread(target=serve, daemon=True)
        thread.start()
        with socket.create_connection(listener.getsockname(), timeout=5) as raw:
            with client_context.wrap_socket(raw, server_hostname="192.168.10.5") as connection:
                assert connection.recv(2) == b"ok"
        thread.join(timeout=5)
        assert not thread.is_alive()
        assert errors == []


def test_https_cli_keeps_key_temporary_and_prints_correct_scheme(monkeypatch, tmp_path, capsys):
    paths = []
    def fake_run(app, **options):
        assert app.state.config.server.https
        for name in ("ssl_certfile", "ssl_keyfile"):
            file = Path(options[name])
            assert file.is_file()
            assert file.parent.name.startswith(".sharedserver-tls-")
            paths.append(file)
    monkeypatch.setattr(cli.uvicorn, "run", fake_run)
    cli.main(["-b", "127.0.0.1", "-d", str(tmp_path), "--https", "--no-qr"])
    assert "https://127.0.0.1:8000/" in capsys.readouterr().out
    assert all(not file.exists() for file in paths)


def test_certificate_names_reject_config_injection():
    dns, ips = certificate_names(["host.local", "evil,IP:1.2.3.4", "0.0.0.0"])
    assert dns == ["host.local", "localhost"]
    assert all(str(address) != "0.0.0.0" for address in ips)
