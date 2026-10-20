"""Shared HTTP/WebSocket access policy; no accounts or login screens."""
from __future__ import annotations

import hmac
import base64
import binascii
from collections import OrderedDict
import ipaddress
import secrets
import socket
import time
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
        self.auth = config.security.auth
        self.pin = config.security.pin
        self.prefix = f"/s/{config.security.random_path}" if config.security.random_path else ""
        self.protected = bool(self.token or self.pin or self.auth)
        self.failures: OrderedDict[str, tuple[float, int]] = OrderedDict()
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
        secret = self.token or self.pin
        return bool(secret) and hmac.compare_digest(
            supplied.encode("utf-8"), secret.encode("utf-8")
        )

    def valid_cookie(self, connection: HTTPConnection) -> bool:
        return hmac.compare_digest(connection.cookies.get(self.cookie_name, "").encode("utf-8"),
                                   self.session.encode("ascii"))

    def valid_basic(self, connection: HTTPConnection) -> bool:
        if self.auth is None:
            return True
        authorization = connection.headers.get("authorization", "")
        scheme, _, credentials = authorization.partition(" ")
        try:
            decoded = base64.b64decode(credentials, validate=True)
            return scheme.casefold() == "basic" and hmac.compare_digest(decoded, self.auth.encode("utf-8"))
        except (ValueError, binascii.Error):
            return False

    def pin_throttled(self, connection: HTTPConnection, *, failed: bool = False) -> bool:
        if self.pin is None:
            return False
        host = connection.client.host if connection.client else "unknown"
        now = time.monotonic()
        start, count = self.failures.get(host, (now, 0))
        if now - start >= 60:
            start, count = now, 0
        if failed:
            self.failures[host] = (start, count + 1)
            self.failures.move_to_end(host)
            if len(self.failures) > 1024:
                self.failures.popitem(last=False)
        return count >= 5

    def authorized(self, connection: HTTPConnection) -> bool:
        if not self.protected:
            return True
        if self.valid_cookie(connection):
            return True
        if self.pin_throttled(connection) or not self.valid_basic(connection):
            return False
        if self.token is None and self.pin is None:
            return True
        authorization = connection.headers.get("authorization", "")
        return (
            authorization.startswith("Bearer ") and self.valid_token(authorization[7:])
        ) or self.valid_token(connection.query_params.get("pin" if self.pin else "token", ""))
