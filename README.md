# SharedServer

[![PyPI Downloads](https://static.pepy.tech/personalized-badge/sharedserver?period=total&units=INTERNATIONAL_SYSTEM&left_color=BLACK&right_color=GREEN&left_text=downloads)](https://pepy.tech/projects/sharedserver)

SharedServer is a zero-configuration, login-free LAN file server and real-time text clipboard. It is as easy to start as `python -m http.server`, while adding uploads, directory browsing, live text synchronization, and allowlisted clipboard actions.

> SharedServer has no authentication. Run it only on a trusted home, lab, or development network. Never expose it directly to the public internet.

## Features

- A shared text clipboard synchronized between all open pages over WebSocket
- A responsive file browser with directory navigation, file sizes, and modification times
- File uploads from desktop and mobile browsers with live progress
- Folder creation and safe, non-overwriting uploads
- Copy actions for allowlisted text and image formats
- Download-only behavior for other formats such as ZIP, RAR, 7z, EXE, APK, and ISO
- Protection against path traversal, directory escape, symlink escape, and unsafe filenames
- No accounts, database, device discovery, template engine, or frontend framework

## Requirements

- Python 3.10 or newer
- A modern desktop or mobile browser

## Installation

Install from PyPI:

```bash
pip install sharedserver
```

Install from source:

```bash
git clone https://github.com/NihaoKangkang/sharedserver.git
cd sharedserver
pip install .
```

## Quick start

Run this command from the directory you want to share:

```bash
python -m sharedserver 8080
```


## CLI reference

```text
usage: sharedserver [-h] [--host HOST] [-d DIRECTORY] [-c CONFIG]
                    [--max-upload-size MB] [--version]
                    [port]
```

| Argument | Description |
| --- | --- |
| `port` | Listening port. Uses the configuration value or `8000` by default. |
| `--host HOST` | Bind address. Defaults to `0.0.0.0`. |
| `-d, --directory PATH` | Directory to share. Defaults to the current directory. |
| `-c, --config PATH` | YAML configuration file. |
| `--max-upload-size MB` | Maximum upload size in MiB. Defaults to 1024 MiB. |
| `--version` | Print the installed version. |

CLI arguments override configuration file values. Without `--config`, SharedServer automatically loads `sharedserver.yaml` from the current directory when it exists.

## Configuration

Copy `sharedserver.example.yaml` to `sharedserver.yaml` and edit it as needed:

```yaml
server:
  host: 0.0.0.0
  port: 8080

share:
  directory: ./
  max_upload_size: 1073741824

clipboard:
  max_text_size: 2097152
  text_extensions:
    - .txt
    - .md
  image_extensions:
    - .png
    - .jpg
```

Relative shared directory paths are resolved from the configuration file's directory. Custom extension lists replace the defaults, and matching is case-insensitive.

Default text extensions:

```text
.txt .md .json .xml .yaml .yml .csv .log .py .js .html .css .java .c .cpp
```

Default image extensions:

```text
.png .jpg .jpeg .webp
```

## Security model

- Every user-supplied path is resolved with `Path.resolve()` and checked against the shared root.
- Absolute paths and `..` path segments are rejected.
- Symlinks are hidden from directory listings and rejected by file operations.
- Upload filenames are stripped of path components, control characters, and unsafe cross-platform characters.
- Uploads are written to a temporary file and published without overwriting an existing file.
- Both `Content-Length` validation and streamed byte counting enforce the upload limit.
- Clipboard actions and server read endpoints use the same strict extension allowlists.
- Browser WebSocket connections from a different origin are rejected.
- Shared text exists only in process memory and is cleared when the server stops.

SharedServer intentionally has no login or authorization layer. Every device that can reach the server can read and write the shared directory and shared text.

## Development

Clone the project and create a virtual environment:

```bash
git clone https://github.com/NihaoKangkang/sharedserver.git
cd sharedserver
python -m venv .venv
```

Activate the environment, then install development dependencies:

```bash
pip install -e ".[dev]"
```

Start a development server:

```bash
python -m sharedserver 8080 --directory .
```


## License

[MIT](LICENSE)
