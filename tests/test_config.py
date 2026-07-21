from pathlib import Path

from sharedserver.config import load_config


def test_yaml_whitelists_replace_defaults_and_resolve_share_directory(tmp_path: Path) -> None:
    shared = tmp_path / "files"
    shared.mkdir()
    config_file = tmp_path / "sharedserver.yaml"
    config_file.write_text(
        """
server:
  port: 9090
share:
  directory: files
clipboard:
  text_extensions: [txt, .MD]
  image_extensions: [.webp]
""",
        encoding="utf-8",
    )

    config = load_config(config_file)

    assert config.server.port == 9090
    assert config.share.directory == shared
    assert config.clipboard.text_extensions == (".txt", ".md")
    assert config.clipboard.image_extensions == (".webp",)

