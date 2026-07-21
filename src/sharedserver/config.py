from __future__ import annotations

from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any

import yaml

DEFAULT_TEXT_EXTENSIONS = (
    ".txt", ".md", ".json", ".xml", ".yaml", ".yml", ".csv", ".log",
    ".py", ".js", ".html", ".css", ".java", ".c", ".cpp",
)
DEFAULT_IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")


@dataclass(frozen=True)
class ServerConfig:
    host: str = "0.0.0.0"
    port: int = 8000


@dataclass(frozen=True)
class ShareConfig:
    directory: Path = field(default_factory=Path.cwd)
    max_upload_size: int = 1024 * 1024 * 1024


@dataclass(frozen=True)
class ClipboardConfig:
    text_extensions: tuple[str, ...] = DEFAULT_TEXT_EXTENSIONS
    image_extensions: tuple[str, ...] = DEFAULT_IMAGE_EXTENSIONS
    max_text_size: int = 2 * 1024 * 1024


@dataclass(frozen=True)
class AppConfig:
    server: ServerConfig = field(default_factory=ServerConfig)
    share: ShareConfig = field(default_factory=ShareConfig)
    clipboard: ClipboardConfig = field(default_factory=ClipboardConfig)

    def with_cli_overrides(
        self,
        *,
        host: str | None = None,
        port: int | None = None,
        directory: Path | None = None,
        max_upload_size: int | None = None,
    ) -> "AppConfig":
        server = replace(
            self.server,
            host=host if host is not None else self.server.host,
            port=port if port is not None else self.server.port,
        )
        share = replace(
            self.share,
            directory=directory if directory is not None else self.share.directory,
            max_upload_size=(
                max_upload_size
                if max_upload_size is not None
                else self.share.max_upload_size
            ),
        )
        result = replace(self, server=server, share=share)
        _validate(result)
        return result


def _extensions(value: Any, default: tuple[str, ...]) -> tuple[str, ...]:
    if value is None:
        return default
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ValueError("clipboard extension lists must contain strings")
    normalized = tuple(
        dict.fromkeys(
            (
                item.strip().lower()
                if item.strip().startswith(".")
                else f".{item.strip().lower()}"
            )
            for item in value
            if item.strip()
        )
    )
    if any("/" in item or "\\" in item for item in normalized):
        raise ValueError("clipboard extensions cannot contain path separators")
    return normalized


def _section(data: dict[str, Any], name: str) -> dict[str, Any]:
    value = data.get(name, {})
    if not isinstance(value, dict):
        raise ValueError(f"{name} must be a mapping")
    return value


def load_config(path: Path | None = None) -> AppConfig:
    config_path = path or Path.cwd() / "sharedserver.yaml"
    if path is None and not config_path.exists():
        result = AppConfig()
        _validate(result)
        return result
    if not config_path.is_file():
        raise FileNotFoundError(f"configuration file not found: {config_path}")

    raw = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    if not isinstance(raw, dict):
        raise ValueError("configuration root must be a mapping")
    server_data = _section(raw, "server")
    share_data = _section(raw, "share")
    clipboard_data = _section(raw, "clipboard")

    directory_value = Path(str(share_data.get("directory", "."))).expanduser()
    if not directory_value.is_absolute():
        directory_value = config_path.resolve().parent / directory_value

    result = AppConfig(
        server=ServerConfig(
            host=str(server_data.get("host", "0.0.0.0")),
            port=int(server_data.get("port", 8000)),
        ),
        share=ShareConfig(
            directory=directory_value.resolve(),
            max_upload_size=int(
                share_data.get("max_upload_size", 1024 * 1024 * 1024)
            ),
        ),
        clipboard=ClipboardConfig(
            text_extensions=_extensions(
                clipboard_data.get("text_extensions"), DEFAULT_TEXT_EXTENSIONS
            ),
            image_extensions=_extensions(
                clipboard_data.get("image_extensions"), DEFAULT_IMAGE_EXTENSIONS
            ),
            max_text_size=int(
                clipboard_data.get("max_text_size", 2 * 1024 * 1024)
            ),
        ),
    )
    _validate(result)
    return result


def _validate(config: AppConfig) -> None:
    if not config.server.host:
        raise ValueError("server.host cannot be empty")
    if not 1 <= config.server.port <= 65535:
        raise ValueError("server.port must be between 1 and 65535")
    if config.share.max_upload_size <= 0:
        raise ValueError("share.max_upload_size must be positive")
    if config.clipboard.max_text_size <= 0:
        raise ValueError("clipboard.max_text_size must be positive")
