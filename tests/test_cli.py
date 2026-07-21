from pathlib import Path

import sharedserver.cli as cli


def test_cli_builds_app_and_starts_uvicorn(
    monkeypatch, tmp_path: Path, capsys
) -> None:
    called = {}

    def fake_run(app, *, host, port, log_config):
        called.update(app=app, host=host, port=port, log_config=log_config)

    monkeypatch.setattr(cli.uvicorn, "run", fake_run)
    monkeypatch.setattr(cli, "get_lan_ip", lambda: "192.168.1.20")

    cli.main(["8080", "--directory", str(tmp_path)])

    output = capsys.readouterr().out
    assert called["host"] == "0.0.0.0"
    assert called["port"] == 8080
    assert called["log_config"]["loggers"]["uvicorn.error"]["level"] == "WARNING"
    assert called["log_config"]["loggers"]["uvicorn.access"]["level"] == "INFO"
    assert "http://127.0.0.1:8080" in output
    assert "http://192.168.1.20:8080" in output
    assert "http://0.0.0.0:8080" not in output
