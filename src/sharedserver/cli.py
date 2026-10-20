from __future__ import annotations

import argparse
import copy
import ipaddress
import os
import secrets
import socket
import sys
import tempfile
from contextlib import ExitStack
from pathlib import Path
from typing import Sequence
from urllib.parse import urlencode

import qrcode
import uvicorn
import ifaddr

from . import __version__
from .config import load_config
from .server import create_app
from .tls import create_certificate


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sharedserver", description="Scan to share files and text on your LAN. No login."
    )
    parser.add_argument("port", nargs="?", type=int, help="port to listen on (legacy positional form)")
    parser.add_argument("-p", "--port", dest="named_port", type=int, help="port to listen on")
    parser.add_argument("-b", "--bind", "--host", dest="host", help="host to bind (default: 0.0.0.0)")
    parser.add_argument("-d", "--directory", type=Path, help="directory to share")
    parser.add_argument("-c", "--config", type=Path, help="YAML configuration file")
    parser.add_argument("--max-size", "--max-upload-size", dest="max_upload_size", type=int, metavar="MB",
                        help="maximum upload size in MiB; 0 means unlimited (default: 1024)")
    parser.add_argument("--auth", metavar="USER:PASS", help="optional HTTP Basic authentication; prefer SHAREDSERVER_AUTH")
    parser.add_argument("--pin", help="optional 4-6 digit access PIN, included in the QR link")
    parser.add_argument("--random-url", action="store_true", help="serve only under an unguessable /s/<secret>/ path")
    parser.add_argument("--mode", choices=("full", "readonly", "droponly"), help="access mode (default: full)")
    parser.add_argument("--https", action="store_true", default=None, help="temporary self-signed HTTPS; requires device trust")
    parser.add_argument("--rename-on-conflict", action="store_true", default=None,
                        help="keep both uploads by appending a number on filename conflicts")
    parser.add_argument("--token", action="store_true", help="generate a private access link (no login)")
    parser.add_argument("--read-only", action=argparse.BooleanOptionalAction, default=None,
                        help="disable uploads and folder creation; text sync stays available")
    parser.add_argument("--qr", action=argparse.BooleanOptionalAction, default=None,
                        help="show a QR code (default: on in interactive terminals)")
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return parser


def get_lan_ip() -> str:
    candidates = []
    try:
        adapters = ifaddr.get_adapters()
    except OSError:
        adapters = []
    for adapter in adapters:
        name = f"{adapter.name} {adapter.nice_name}".casefold()
        if any(name.startswith(prefix) or f" {prefix}" in name for prefix in
               ("lo", "utun", "tun", "tap", "vmnet", "vbox", "docker", "virbr", "veth",
                "bridge", "awdl", "llw", "tailscale", "zerotier", "wg", "zt", "br-")):
            continue
        for interface in adapter.ips:
            if isinstance(interface.ip, str):
                address = ipaddress.ip_address(interface.ip)
                if not (address.is_loopback or address.is_link_local or address.is_unspecified):
                    candidates.append(interface.ip)
    # A VPN's default route can point at a virtual adapter. Prefer a private
    # address registered for this computer before falling back to route lookup.
    private_networks = tuple(ipaddress.ip_network(network) for network in
                             ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))
    for address in candidates:
        if any(ipaddress.ip_address(address) in network for network in private_networks):
            return address
    try:
        for address in socket.gethostbyname_ex(socket.gethostname())[2]:
            if any(ipaddress.ip_address(address) in network for network in private_networks):
                return address
    except OSError:
        pass
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("192.0.2.1", 80))  # Route lookup only; sends no traffic.
        return str(sock.getsockname()[0])
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return "127.0.0.1"
    finally:
        sock.close()


def address_url(host: str, port: int, token: str | None = None, *, https: bool = False,
                prefix: str = "", pin: str | None = None) -> str:
    authority = f"[{host}]" if ":" in host else host
    url = f"{'https' if https else 'http'}://{authority}:{port}{prefix}/"
    if token or pin:
        url += "?" + urlencode({"token" if token else "pin": token or pin})
    return url


def is_loopback(host: str) -> bool:
    if host.casefold() == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def print_qr(url: str) -> None:
    code = qrcode.QRCode(border=4)
    code.add_data(url)
    code.make(fit=True)
    try:
        code.print_ascii(out=sys.stdout, invert=True)
    except UnicodeEncodeError:
        # Legacy Windows consoles can still display full-width ASCII modules.
        for row in code.get_matrix():
            print("".join("##" if cell else "  " for cell in row))


def main(argv: Sequence[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.port is not None and args.named_port is not None:
        parser.error("choose a positional port or --port, not both")
    try:
        token = secrets.token_urlsafe(32) if args.token else os.environ.get("SHAREDSERVER_TOKEN")
        config = load_config(args.config).with_cli_overrides(
            host=args.host, port=args.named_port if args.named_port is not None else args.port,
            directory=args.directory.expanduser().resolve() if args.directory else None,
            max_upload_size=args.max_upload_size * 1024 * 1024 if args.max_upload_size is not None else None,
            read_only=args.read_only, token=token,
            auth=args.auth if args.auth is not None else os.environ.get("SHAREDSERVER_AUTH"),
            pin=args.pin, random_path=secrets.token_urlsafe(24) if args.random_url else None,
            mode=args.mode, https=args.https,
            rename_on_conflict=args.rename_on_conflict,
        )
        app = create_app(config)
    except (OSError, ValueError, TypeError) as exc:
        parser.error(str(exc))

    host, port, token = config.server.host, config.server.port, config.security.token
    wildcard = host in {"0.0.0.0", "::"}
    advertised_host = get_lan_ip() if host == "0.0.0.0" else ("::1" if host == "::" else host)
    prefix = f"/s/{config.security.random_path}" if config.security.random_path else ""
    options = {"https": config.server.https, "prefix": prefix, "pin": config.security.pin}
    url = address_url(advertised_host, port, token, **options)
    print(f"SharedServer {__version__}\nSharing: {config.share.directory}")
    if wildcard:
        local_host = "127.0.0.1" if host == "0.0.0.0" else "::1"
        print(f"Local: {address_url(local_host, port, token, **options)}")
    print(f"{'Local' if is_loopback(advertised_host) else 'LAN'}:   {url}")
    if host == "::":
        print("IPv6 bind: use this computer's LAN IPv6 address on other devices.")
    if not is_loopback(host):
        if token or config.security.pin or config.security.auth or prefix:
            print("Access protection enabled. Keep this link and configured credentials private.")
        else:
            print("WARNING: No access token. Every reachable device can access this share.\n"
                  "Use trusted Wi-Fi, or restart with --token for a private QR link.")
    if config.share.read_only:
        print("Files are read-only. Shared text remains editable.")
    limit = f"{config.share.max_upload_size} bytes" if config.share.max_upload_size else "unlimited"
    print(f"Mode: {config.share.mode}; file writes: {'on' if config.share.can_upload else 'off'}; "
          f"authentication: {'Basic' if config.security.auth else 'PIN' if config.security.pin else 'token' if token else 'none'}; "
          f"upload limit: {limit}")
    if config.security.pin:
        print("PINs are low entropy. Use --token or --random-url on less trusted networks.")
    if config.server.https:
        print("Temporary self-signed HTTPS: the certificate is NOT automatically trusted by your devices.\n"
              "Image clipboard support still depends on device trust and browser permissions.")
    if args.qr is True or (args.qr is None and sys.stdout.isatty()):
        print("\nScan with your phone on the same Wi-Fi:")
        print_qr(url)
    print("\nKeep this terminal open. Press Ctrl+C to stop.\n", flush=True)
    log_config = copy.deepcopy(uvicorn.config.LOGGING_CONFIG)
    log_config["loggers"]["uvicorn.error"]["level"] = "WARNING"
    if token or config.security.pin or config.security.auth or prefix:
        log_config["loggers"]["uvicorn.access"]["level"] = "WARNING"
    with ExitStack() as stack:
        ssl_options = {}
        if config.server.https:
            directory = Path(stack.enter_context(tempfile.TemporaryDirectory(prefix=".sharedserver-tls-")))
            try:
                cert, key = create_certificate(directory, [host, advertised_host, socket.gethostname()])
            except ValueError as exc:
                parser.error(str(exc))
            ssl_options = {"ssl_certfile": str(cert), "ssl_keyfile": str(key)}
        uvicorn.run(app, host=host, port=port, log_config=log_config,
                    ws_max_size=config.clipboard.max_text_size * 6 + 1024,
                    proxy_headers=False, **ssl_options)
