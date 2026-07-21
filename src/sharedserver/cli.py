from __future__ import annotations

import argparse
import copy
import socket
from pathlib import Path
from typing import Sequence

import uvicorn

from . import __version__
from .config import load_config
from .server import create_app


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sharedserver",
        description="LAN file sharing and real-time text clipboard",
    )
    parser.add_argument("port", nargs="?", type=int, help="port to listen on")
    parser.add_argument("--host", help="host to bind (default: 0.0.0.0)")
    parser.add_argument("-d", "--directory", type=Path, help="directory to share")
    parser.add_argument("-c", "--config", type=Path, help="YAML configuration file")
    parser.add_argument(
        "--max-upload-size",
        type=int,
        metavar="MB",
        help="maximum upload size in MiB",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return parser


def get_lan_ip() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return str(sock.getsockname()[0])
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return "127.0.0.1"
    finally:
        sock.close()


def main(argv: Sequence[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        config = load_config(args.config).with_cli_overrides(
            host=args.host,
            port=args.port,
            directory=args.directory.expanduser().resolve() if args.directory else None,
            max_upload_size=(
                args.max_upload_size * 1024 * 1024
                if args.max_upload_size is not None
                else None
            ),
        )
        app = create_app(config)
    except (FileNotFoundError, NotADirectoryError, ValueError) as exc:
        parser.error(str(exc))

    port = config.server.port
    print(
        "SharedServer running:\n\n"
        f"Local:\nhttp://127.0.0.1:{port}\n\n"
        f"LAN:\nhttp://{get_lan_ip()}:{port}\n\n"
        f"Sharing: {config.share.directory}\n"
    )
    log_config = copy.deepcopy(uvicorn.config.LOGGING_CONFIG)
    log_config["loggers"]["uvicorn.error"]["level"] = "WARNING"
    uvicorn.run(app, host=config.server.host, port=port, log_config=log_config)
