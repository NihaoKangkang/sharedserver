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
    https: bool = False


@dataclass(frozen=True)
class ShareConfig:
    directory: Path = field(default_factory=Path.cwd)
    max_upload_size: int = 1024 * 1024 * 1024
    read_only: bool = False
    mode: str = "full"
    rename_on_conflict: bool = False

    @property
    def can_read(self) -> bool:
        return self.mode != "droponly"

    @property
    def can_upload(self) -> bool:
        return not self.read_only and self.mode != "readonly"

    @property
    def can_write_text(self) -> bool:
        return self.mode != "readonly"


@dataclass(frozen=True)
class SecurityConfig:
    token: str | None = field(default=None, repr=False)
    auth: str | None = field(default=None, repr=False)
    pin: str | None = field(default=None, repr=False)
    random_path: str | None = field(default=None, repr=False)


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
        auth: str | None = None,
        pin: str | None = None,
        random_path: str | None = None,
        mode: str | None = None,
        https: bool | None = None,
        rename_on_conflict: bool | None = None,
    ) -> "AppConfig":
        server = replace(
            self.server,
            https=https if https is not None else self.server.https,
            host=host if host is not None else self.server.host,
            port=port if port is not None else self.server.port,
        )
        share = replace(
            self.share,
            rename_on_conflict=rename_on_conflict if rename_on_conflict is not None else self.share.rename_on_conflict,
            mode=mode if mode is not None else self.share.mode,
            read_only=read_only if read_only is not None else self.share.read_only,
            directory=directory if directory is not None else self.share.directory,
            max_upload_size=(
                max_upload_size
                if max_upload_size is not None
                else self.share.max_upload_size
            ),
        )
        security = replace(self.security,
                           token=token if token is not None else self.security.token,
                           auth=auth if auth is not None else self.security.auth,
                           pin=pin if pin is not None else self.security.pin,
                           random_path=random_path if random_path is not None else self.security.random_path)
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
            https=server_data.get("https", False),
            host=str(server_data.get("host", "0.0.0.0")),
            port=int(server_data.get("port", 8000)),
        ),
        share=ShareConfig(
            rename_on_conflict=share_data.get("rename_on_conflict", False),
            mode=share_data.get("mode", "full"),
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
        security=SecurityConfig(token=security_data.get("token"),
                                auth=security_data.get("auth"), pin=security_data.get("pin"),
                                random_path=security_data.get("random_path")),
    )
    _validate(result)
    return result


def _validate(config: AppConfig) -> None:
    if not isinstance(config.share.mode, str) or config.share.mode not in {"full", "readonly", "droponly"}:
        raise ValueError("share.mode must be full, readonly or droponly")
    if config.share.read_only and config.share.mode == "droponly":
        raise ValueError("--read-only cannot be combined with droponly")
    if type(config.server.https) is not bool:
        raise ValueError("server.https must be true or false")
    auth = config.security.auth
    if auth is not None and (not isinstance(auth, str) or ":" not in auth
                             or not all(auth.split(":", 1)) or len(auth) > 1024
                             or any(ord(c) < 32 for c in auth)):
        raise ValueError("security.auth must be username:password with both values nonempty")
    pin = config.security.pin
    if pin is not None and (not isinstance(pin, str) or not pin.isascii()
                            or not pin.isdigit() or not 4 <= len(pin) <= 6):
        raise ValueError("security.pin must be 4-6 ASCII digits (quote it in YAML)")
    if pin and config.security.token:
        raise ValueError("choose --pin or --token, not both")
    prefix = config.security.random_path
    if prefix is not None and (not isinstance(prefix, str) or not 16 <= len(prefix) <= 128
                               or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for c in prefix)):
        raise ValueError("security.random_path must be 16-128 URL-safe characters")
    if type(config.share.read_only) is not bool:
        raise ValueError("share.read_only must be true or false")
    if type(config.share.rename_on_conflict) is not bool:
        raise ValueError("share.rename_on_conflict must be true or false")
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
    if config.share.max_upload_size < 0:
        raise ValueError("share.max_upload_size must be zero (unlimited) or positive")
    if config.clipboard.max_text_size <= 0:
        raise ValueError("clipboard.max_text_size must be positive")
