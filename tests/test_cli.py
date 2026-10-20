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
    monkeypatch.setattr(cli.socket, "gethostbyname_ex", lambda _: ("computer", [], ["127.0.0.1", "198.18.0.1", "192.168.0.90"]))
    assert cli.get_lan_ip() == "192.168.0.90"


def test_real_qr_renders_to_a_redirected_stream(capsys):
    cli.print_qr("http://192.168.1.23:8000/")
    assert len(capsys.readouterr().out.splitlines()) > 10
