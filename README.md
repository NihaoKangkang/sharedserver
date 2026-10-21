# SharedServer

[English](https://github.com/NihaoKangkang/sharedserver/blob/main/README.md) · [简体中文](https://github.com/NihaoKangkang/sharedserver/blob/main/README_zh.md)

[![PyPI](https://img.shields.io/pypi/v/sharedserver.svg)](https://pypi.org/project/sharedserver/)
[![Python](https://img.shields.io/pypi/pyversions/sharedserver.svg)](https://pypi.org/project/sharedserver/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/NihaoKangkang/sharedserver/blob/main/LICENSE)
[![CI](https://github.com/NihaoKangkang/sharedserver/actions/workflows/ci.yml/badge.svg)](https://github.com/NihaoKangkang/sharedserver/actions/workflows/ci.yml)

**Scan to move files, share text and images between browsers, or transfer from a headless terminal. No login by default.**

## Start in seconds

Run inside a **dedicated transfer folder** on trusted Wi-Fi:

```bash
uvx sharedserver
# Or run without a permanent installation:
pipx run sharedserver
# Or install normally:
python -m pip install sharedserver
sharedserver
```

Scan the terminal QR code on your phone. Both devices need the same network. Keep the terminal open and press **Ctrl+C** when finished. Python 3.10+ is required. [Install uv](https://docs.astral.sh/uv/getting-started/installation/) or [pipx](https://pipx.pypa.io/stable/installation/) separately if needed.

**Default access is open to every reachable device.** Use `sharedserver --token` for a private QR link, and share only the folder you intend to expose.

![Demo: two browser sessions exchanging text and an image](https://raw.githubusercontent.com/NihaoKangkang/sharedserver/main/docs/assets/demo.gif)

The short demo uses a desktop and a mobile-sized Chromium session, including ordinary LAN HTTP. It is not a physical iOS/Android certification.

## Files, text and images

- Upload from the file picker, paste images/files with **Ctrl+V / Cmd+V**, or drag files anywhere onto the page. Uploads show percentage, average speed and estimated remaining time.
- Paste text anywhere outside another input to fill the shared text box. Full mode synchronizes edits live; receiving devices choose **Copy text**.
- Uploaded supported images appear on connected pages. Use **Copy image** in a trusted secure context; otherwise a preview opens for long-press/right-click copying or saving. Files stay in the shared folder; this does not automatically read or write the OS clipboard.
- Select up to **200 files in the current folder** and choose **Download ZIP**. ZIPs are staged on disk and downloaded natively, without buffering the archive into browser memory.
- Downloads support **HTTP Range**, including resume and HEAD requests. Uploads stream in chunks and never silently overwrite a file. Add `--rename-on-conflict` to keep both copies as `name (1).ext`.
- Text is limited to **2 MiB of UTF-8** by default. Full/readonly text is kept in memory; drop-only submissions are saved as unique `text_*.txt` files. Images are files, not large WebSocket messages.

## Workspace UI

Version 0.4.0 adds an offline-first workspace for desktop and mobile browsers. Upgrade with `python -m pip install --upgrade sharedserver` or `pipx upgrade sharedserver`.

- Desktop: file explorer and shared text side by side; tablet: workspace tabs; phone: file cards with an always-visible download button.
- System/light/dark themes, current-folder search and sorting, safe plain-text/image previews, and a cancellable transfer queue.
- Mobile developer actions live under More. The header tools menu contains QR sharing and keyboard help; text supports explicit sync shortcuts, wrapping and a manual-copy fallback.
- Protected QR links must be pasted from the terminal. curl commands use explicit authentication templates; browser sessions and passwords are never exported. Audio/video playback and folder uploads remain outside this iteration.

## Access modes

| Mode | Browse / download / ZIP | Upload files | Read shared text/images | Submit text/images |
| --- | --- | --- | --- | --- |
| `--mode full` (default) | Yes | Yes | Yes | Yes |
| `--mode readonly` | Yes | No | Yes | No |
| `--mode droponly` | No | Yes, inbox root | No history | Text via **Submit text**, images via upload |

Drop-only users cannot create folders or read earlier submissions through HTTP or WebSocket. The operator reads collected files directly on the host. Duplicate text submissions are saved separately.

The legacy `--read-only` switch still means **file writes off, text editable**. Use `--mode readonly` to lock text too. It cannot be combined with `--mode droponly`.

## CLI reference

| Option | Default | Purpose |
| --- | --- | --- |
| `[port]` | `8000` | Original positional port, still supported |
| `-p, --port PORT` | Config or `8000` | Named port; cannot be combined with positional port |
| `-b, --bind, --host HOST` | `0.0.0.0` | Bind address; `127.0.0.1` limits access to this computer |
| `-d, --directory PATH` | Current directory | Shared root |
| `-c, --config PATH` | Auto-load `sharedserver.yaml` if present | YAML configuration |
| `--mode full\|readonly\|droponly` | `full` | HTTP, WebSocket and UI permissions |
| `--read-only / --no-read-only` | Off | Legacy file-only protection |
| `--max-size, --max-upload-size MB` | `1024` | Per-file limit in MiB; explicit `0` means unlimited |
| `--rename-on-conflict` | Off | Append a number instead of returning `409 Conflict` |
| `--token` | Off | Generate a strong random token in the QR link |
| `--pin PIN` | Off | 4–6 ASCII digits in `?pin=...`; choose PIN or token |
| `--random-url` | Off | Serve only under a random `/s/<secret>/` prefix |
| `--auth USER:PASS` | Off | Optional HTTP Basic Auth; can combine with a link or PIN |
| `--https` | Off | Temporary self-signed certificate, valid for one day |
| `--qr / --no-qr` | On in interactive terminals | Force / suppress QR output |
| `--version`, `-h / --help` | — | Version / help |

Examples:

```bash
sharedserver -p 8080 -d ~/Transfer --token
sharedserver --mode readonly --random-url
sharedserver --mode droponly --pin 123456 --rename-on-conflict
sharedserver --max-size 0 --rename-on-conflict
python -m sharedserver 8080 --host 127.0.0.1
```

For secrets that should not appear in process arguments, use **`SHAREDSERVER_AUTH`** (`username:password`) or **`SHAREDSERVER_TOKEN`** (16–256 printable ASCII characters without whitespace). CLI overrides the environment, which overrides YAML; `--token` generates a new token. Tokens/PINs bootstrap an HttpOnly, SameSite browser session and disappear from the URL. Sessions expire at restart. Basic Auth uses the browser's built-in prompt; no account database is created. PINs allow five failed attempts per client address per minute, with bounded tracking; strong token links are preferable to short PINs. Random paths and secrets are omitted from request access logs when protection is enabled.

### HTTPS and clipboard trust

`--https` generates a fresh certificate and key in a private, hidden temporary directory, then removes them on exit. It uses installed OpenSSL, or the optional `cryptography` extra:

```bash
python -m pip install 'sharedserver[https]'
sharedserver --https --token
# Run temporarily with HTTPS support:
uvx --from 'sharedserver[https]' sharedserver --https
```

**Self-signed HTTPS does not automatically establish device trust.** The program never installs a root certificate, changes browser security, or bypasses a certificate warning. Image clipboard access still depends on certificate trust, browser support and permissions. A new certificate is generated on each run. For ordinary HTTP, text-copy fallback and image preview/download remain available. See [MDN secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts).

## Headless / curl cheat sheet

These commands use the default full mode without access protection:

```bash
# Upload a file; PUT is the supported curl upload interface (not multipart -F).
curl --fail --upload-file ./report.pdf http://192.168.1.23:8000/upload/report.pdf
# Download, or resume a partial download.
curl --fail -o report.pdf 'http://192.168.1.23:8000/api/download?path=report.pdf'
curl --fail -C - -o report.pdf 'http://192.168.1.23:8000/api/download?path=report.pdf'
# Read, save or update UTF-8 shared text. Inspect text before executing anything.
curl --fail --silent http://192.168.1.23:8000/api/clipboard/raw
curl --fail --silent http://192.168.1.23:8000/api/clipboard/raw > clipboard.txt
curl --fail --data-binary 'hello world' http://192.168.1.23:8000/api/clipboard/raw
# Download selected files as a ZIP.
curl --fail -H 'Content-Type: application/json' -d '{"paths":["one.txt","two.txt"]}' \
  -o selected.zip http://192.168.1.23:8000/api/zip
```

Use the **complete printed base URL** for `--random-url`: endpoints then live under `/s/<secret>/api/...` and `/s/<secret>/upload/...`. Token clients send `Authorization: Bearer <token>`; PIN clients append `?pin=<pin>`; Basic clients use `curl --user username` to prompt for the password. With Basic plus token, use Basic credentials plus `?token=...` (one Authorization header cannot carry both). For HTTPS use a CA/certificate you have verified with curl's `--cacert`; the examples do not disable certificate verification. curl/Wget upload clients receive `OK: filename uploaded` with HTTP 201. Other API clients receive JSON.

## Configuration and troubleshooting

See [sharedserver.example.yaml](https://github.com/NihaoKangkang/sharedserver/blob/main/sharedserver.example.yaml). CLI values override YAML. Relative shared roots resolve from the config file's directory. Copy-format allowlists replace defaults, case-insensitively. Active HTML/SVG/JS/XML types are never served as inline images, even through a custom allowlist. Default image preview formats are PNG, JPEG and WebP, with signature checks. Other formats remain downloadable as attachments.

If a phone cannot connect, check same Wi-Fi, guest-device isolation, and the host firewall. With a VPN or multiple adapters, choose the correct address explicitly: `sharedserver -b 192.168.1.23`. Use another port if 8000 is busy, and `--qr` for redirected terminal output. If the executable is missing, try `python -m sharedserver` with the same Python used to install it. For externally managed Python installations, use uvx/pipx or the [PyPA virtual environment guide](https://packaging.python.org/en/latest/guides/installing-using-pip-and-virtual-environments/).

## Security and development

Share a dedicated directory on a trusted network and stop the process when finished. Basic/PIN/token/path protection controls access; **HTTP does not encrypt traffic**. This is not a public-internet hosting service. Hidden paths, symlinks, special files and the active config are blocked. Paths are resolved under the shared root; MIME sniffing is disabled and downloads are attachments. Names/text use DOM `textContent`, not HTML interpolation. Upload and archive work uses bounded chunks and disk staging. The shared directory must be controlled by its owner; untrusted local path replacement is outside the threat model.

```bash
git clone https://github.com/NihaoKangkang/sharedserver.git
cd sharedserver
python -m venv .venv
# Activate the virtual environment with your shell, then:
python -m pip install -e '.[dev,https]'
python -m pytest
python -m build
python -m twine check dist/*
```

CI tests Linux/macOS/Windows on Python 3.10–3.14, packaged assets, and four Chromium suites. Browser reproduction: `npm install --no-save playwright jsqr@1.4.0`, `npx playwright install chromium`, then `SHARED_PYTHON=.venv/bin/python node scripts/browser_vnext.cjs` (shell environment syntax varies). `LAN_SMOKE=1` additionally tests a real LAN HTTP address. Run `SHARED_PYTHON=.venv/bin/python node scripts/browser_ui.cjs` for the responsive/interaction matrix and independent QR decoding. Run `SHARED_PYTHON=.venv/bin/python node scripts/browser_ui_audit.cjs` for navigation, focus, form, and accessible upload regressions. [Release runbook](https://github.com/NihaoKangkang/sharedserver/blob/main/docs/releasing.md).

[MIT license](https://github.com/NihaoKangkang/sharedserver/blob/main/LICENSE) · [Report an issue](https://github.com/NihaoKangkang/sharedserver/issues)
