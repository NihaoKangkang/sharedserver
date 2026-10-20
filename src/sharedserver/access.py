"""Shared HTTP/WebSocket access policy; no accounts or login screens."""
from __future__ import annotations

import hmac
import ipaddress
import secrets
import socket
from urllib.parse import urlsplit

from starlette.requests import HTTPConnection

from .config import AppConfig


def same_origin(connection: HTTPConnection) -> bool:
    if connection.headers.get("sec-fetch-site") == "cross-site":
        return False
    origin = connection.headers.get("origin")
    if origin is None:
        return True  # CLI clients do not send Origin.
    try:
        parsed = urlsplit(origin)
        scheme = "https" if connection.url.scheme in {"https", "wss"} else "http"
        return (
            parsed.scheme == scheme
            and parsed.netloc.casefold() == connection.headers.get("host", "").casefold()
            and not parsed.path and not parsed.query and not parsed.fragment
        )
    except ValueError:
        return False


class AccessPolicy:
    def __init__(self, config: AppConfig):
        self.token = config.security.token
        self.session = secrets.token_urlsafe(32)
        self.cookie_name = f"sharedserver_{config.server.port}"
        hostname = socket.gethostname().casefold()
        self.hostnames = {"localhost", hostname, f"{hostname.split('.')[0]}.local"}
        if config.server.host not in {"0.0.0.0", "::"}:
            self.hostnames.add(config.server.host.casefold())

    def allowed_host(self, connection: HTTPConnection) -> bool:
        try:
            parsed = urlsplit(f"//{connection.headers.get('host', '')}")
            host = parsed.hostname
            if (parsed.username is not None or parsed.password is not None
                    or parsed.path or parsed.query or parsed.fragment):
                return False
            if parsed.port is not None and not 1 <= parsed.port <= 65535:
                return False
            if not host:
                return False
            if host.casefold() in self.hostnames:
                return True
            ipaddress.ip_address(host)
            return True
        except ValueError:
            return False

    def valid_token(self, supplied: str) -> bool:
        return bool(self.token) and hmac.compare_digest(
            supplied.encode("utf-8"), self.token.encode("utf-8")
        )

    def authorized(self, connection: HTTPConnection) -> bool:
        if self.token is None:
            return True
        cookie = connection.cookies.get(self.cookie_name, "")
        if hmac.compare_digest(cookie.encode("utf-8"), self.session.encode("ascii")):
            return True
        authorization = connection.headers.get("authorization", "")
        return (
            authorization.startswith("Bearer ") and self.valid_token(authorization[7:])
        ) or self.valid_token(connection.query_params.get("token", ""))
