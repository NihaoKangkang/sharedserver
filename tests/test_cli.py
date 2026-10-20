from pathlib import Path

import sharedserver.cli as cli


def test_cli_builds_app_and_starts_uvicorn(
    monkeypatch, tmp_path: Path, capsys
) -> None:
    called = {}

    def fake_run(app, *, host, port, log_config, **kwargs):
        called.update(app=app, host=host, port=port, log_config=log_config, **kwargs)

    monkeypatch.setattr(cli.uvicorn, "run", fake_run)
    monkeypatch.setattr(cli, "get_lan_ip", lambda: "192.168.1.20")

    cli.main(["8080", "--directory", str(tmp_path)])

    output = capsys.readouterr().out
    assert called["host"] == "0.0.0.0"
    assert called["port"] == 8080
    assert called["proxy_headers"] is False
    assert called["log_config"]["loggers"]["uvicorn.error"]["level"] == "WARNING"
    assert called["log_config"]["loggers"]["uvicorn.access"]["level"] == "INFO"
    assert "http://127.0.0.1:8080" in output
    assert "http://192.168.1.20:8080" in output
    assert "http://0.0.0.0:8080" not in output


def test_token_qr_and_bound_host_use_the_same_url(monkeypatch, tmp_path, capsys):
    called = {}
    codes = []
    monkeypatch.setattr(cli.uvicorn, "run", lambda app, **kwargs: called.update(app=app, **kwargs))
    monkeypatch.setattr(cli, "print_qr", codes.append)
    cli.main(["--host", "192.168.1.50", "-d", str(tmp_path), "--token", "--qr", "--read-only"])
    output = capsys.readouterr().out
    config = called["app"].state.config
    assert len(config.security.token) >= 32
    assert codes == [cli.address_url("192.168.1.50", 8000, config.security.token)]
    assert codes[0] in output
    assert "127.0.0.1" not in output
    assert config.share.read_only
    assert called["log_config"]["loggers"]["uvicorn.access"]["level"] == "WARNING"


def test_loopback_no_qr_and_environment_token(monkeypatch, tmp_path, capsys):
    called = {}
    monkeypatch.setenv("SHAREDSERVER_TOKEN", "environment-token-for-test")
    monkeypatch.setattr(cli.uvicorn, "run", lambda app, **kwargs: called.update(app=app, **kwargs))
    monkeypatch.setattr(cli, "print_qr", lambda _: (_ for _ in ()).throw(AssertionError("unexpected QR")))
    cli.main(["--host", "::1", "-d", str(tmp_path), "--no-qr"])
    assert "http://[::1]:8000/?token=environment-token-for-test" in capsys.readouterr().out
    assert called["app"].state.config.security.token == "environment-token-for-test"


def test_lan_address_prefers_real_private_interface_over_vpn_route(monkeypatch):
    monkeypatch.setattr(cli.ifaddr, "get_adapters", lambda: [])
    monkeypatch.setattr(cli.socket, "gethostbyname_ex", lambda _: ("computer", [], ["127.0.0.1", "198.18.0.1", "192.168.0.90"]))
    assert cli.get_lan_ip() == "192.168.0.90"


def test_real_qr_renders_to_a_redirected_stream(capsys):
    cli.print_qr("http://192.168.1.23:8000/")
    assert len(capsys.readouterr().out.splitlines()) > 10


def test_vnext_aliases_modes_auth_and_unlimited_uploads(monkeypatch, tmp_path, capsys):
    called = {}
    monkeypatch.setattr(cli.uvicorn, "run", lambda app, **kwargs: called.update(app=app, **kwargs))
    cli.main(["-p", "9000", "-b", "127.0.0.1", "-d", str(tmp_path), "--mode", "droponly",
              "--auth", "user:secret", "--random-url", "--max-size", "0", "--no-qr"])
    config = called["app"].state.config
    assert called["port"] == 9000
    assert config.share.mode == "droponly"
    assert config.share.max_upload_size == 0
    assert config.security.auth == "user:secret"
    assert config.security.random_path
    output = capsys.readouterr().out
    assert "secret" not in output
    assert "/s/" in output
    assert "authentication: Basic" in output
    assert "unlimited" in output


def test_port_arguments_cannot_conflict(monkeypatch):
    import pytest
    with pytest.raises(SystemExit):
        cli.main(["8000", "--port", "9000"])


def test_interface_detection_ignores_tunnels_and_loopback(monkeypatch):
    from types import SimpleNamespace
    def adapter(name, ip):
        return SimpleNamespace(name=name, nice_name=name, ips=[SimpleNamespace(ip=ip)])
    monkeypatch.setattr(cli.ifaddr, "get_adapters", lambda: [adapter("lo0", "127.0.0.1"),
                        adapter("utun0", "10.0.0.1"), adapter("Wi-Fi", "192.168.10.5")])
    assert cli.get_lan_ip() == "192.168.10.5"
