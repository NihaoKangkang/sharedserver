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
    read_only: bool = False


@dataclass(frozen=True)
class SecurityConfig:
    token: str | None = field(default=None, repr=False)


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
    security: SecurityConfig = field(default_factory=SecurityConfig)
    config_file: Path | None = None

    def with_cli_overrides(
        self,
        *,
        host: str | None = None,
        port: int | None = None,
        directory: Path | None = None,
        max_upload_size: int | None = None,
        read_only: bool | None = None,
        token: str | None = None,
    ) -> "AppConfig":
        server = replace(
            self.server,
            host=host if host is not None else self.server.host,
            port=port if port is not None else self.server.port,
        )
        share = replace(
            self.share,
            read_only=read_only if read_only is not None else self.share.read_only,
            directory=directory if directory is not None else self.share.directory,
            max_upload_size=(
                max_upload_size
                if max_upload_size is not None
                else self.share.max_upload_size
            ),
        )
        security = replace(self.security, token=token if token is not None else self.security.token)
        result = replace(self, server=server, share=share, security=security)
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

    try:
        raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ValueError("invalid YAML configuration") from exc
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise ValueError("configuration root must be a mapping")
    server_data = _section(raw, "server")
    share_data = _section(raw, "share")
    clipboard_data = _section(raw, "clipboard")
    security_data = _section(raw, "security")

    directory_value = Path(str(share_data.get("directory", "."))).expanduser()
    if not directory_value.is_absolute():
        directory_value = config_path.resolve().parent / directory_value

    result = AppConfig(
        config_file=config_path.resolve(),
        server=ServerConfig(
            host=str(server_data.get("host", "0.0.0.0")),
            port=int(server_data.get("port", 8000)),
        ),
        share=ShareConfig(
            read_only=share_data.get("read_only", False),
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
        security=SecurityConfig(token=security_data.get("token")),
    )
    _validate(result)
    return result


def _validate(config: AppConfig) -> None:
    if type(config.share.read_only) is not bool:
        raise ValueError("share.read_only must be true or false")
    token = config.security.token
    if token is not None and (
        not isinstance(token, str) or not 16 <= len(token) <= 256
        or not token.isascii() or any(char.isspace() for char in token)
        or not token.isprintable()
    ):
        raise ValueError("security.token must be 16-256 printable ASCII characters without whitespace")
    if not config.server.host:
        raise ValueError("server.host cannot be empty")
    if not 1 <= config.server.port <= 65535:
        raise ValueError("server.port must be between 1 and 65535")
    if config.share.max_upload_size <= 0:
        raise ValueError("share.max_upload_size must be positive")
    if config.clipboard.max_text_size <= 0:
        raise ValueError("clipboard.max_text_size must be positive")
