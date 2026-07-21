# SharedServer

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

The installed console command works as well:

```bash
sharedserver 8080
```

SharedServer listens on every network interface by default and prints usable local and LAN addresses:

```text
SharedServer running:

Local:
http://127.0.0.1:8080

LAN:
http://192.168.x.x:8080
```

Open the LAN address on another device connected to the same trusted network. `0.0.0.0` is a bind address, not a browser destination, so it is intentionally not printed as an access URL. HTTP access logs remain visible in the terminal for debugging.

## Screenshot

Before publishing, save a current screenshot as `docs/screenshot.png` and uncomment the following line:

<!-- ![SharedServer interface](docs/screenshot.png) -->

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

## Browser compatibility

File browsing and transfer work in current Chrome, Edge, and Safari releases. Modern clipboard APIs are usually restricted to secure contexts such as HTTPS or localhost:

- Text copying falls back to the legacy browser copy command when the modern Clipboard API is unavailable.
- Image copying requires `ClipboardItem` and may be rejected when the site is opened from a plain HTTP LAN address.
- Downloads remain available when clipboard access is unavailable.
- Use a trusted HTTPS reverse proxy when image copying must work across all supported devices.

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

## Tests

```bash
pytest
```

The test suite covers path and symlink safety, filename cleaning, copy allowlists, malformed UTF-8 handling, configuration loading, CLI startup, upload limits, non-overwriting uploads, downloads, and WebSocket synchronization.

## Build and publish

Releases are published from GitHub Actions with PyPI Trusted Publishing. This uses short-lived OpenID Connect credentials, so no PyPI API token needs to be stored in the repository.

### One-time PyPI setup

1. Create the `pypi` environment under **GitHub repository Settings > Environments**. Adding required reviewers is recommended for release approval.
2. In the PyPI publishing settings, add a pending trusted publisher with these values:

   | Field | Value |
   | --- | --- |
   | PyPI project name | `sharedserver` |
   | GitHub owner | `NihaoKangkang` |
   | GitHub repository | `sharedserver` |
   | Workflow filename | `publish.yml` |
   | Environment name | `pypi` |

A pending publisher can create the PyPI project during the first release, but it does not reserve the project name before that release is published.

### Publish a release

1. Update the version in both `src/sharedserver/__init__.py` and `pyproject.toml`. PyPI does not allow an existing release file or version to be replaced.
2. Run the release checks locally:

   ```bash
   pytest
   python -m build
   python -m twine check dist/*
   ```

3. Commit and push the version change.
4. Create and publish a GitHub release whose tag matches the version, such as `v0.1.0`.
5. The `Publish to PyPI` workflow tests the tagged revision, builds the distributions, checks them, and publishes them to PyPI.

### Optional TestPyPI verification

TestPyPI is a separate service with separate accounts and credentials. It is useful for validating package metadata and installation before a first production release, but it is not required for every release.

Upload a locally built distribution:

```bash
python -m twine upload --repository testpypi dist/*
```

Then install it in a clean environment without resolving dependencies from TestPyPI:

```bash
python -m pip install --index-url https://test.pypi.org/simple/ --no-deps sharedserver
```

Manual production uploads with `python -m twine upload dist/*` remain possible with a scoped PyPI API token, but Trusted Publishing is the recommended release path. Never store credentials in the repository.

## License

[MIT](LICENSE)
