# vNext implementation and compatibility record

Source preview: 0.3.0. Implemented against the user's vNext specification on 2026-10-20. This change does not publish a GitHub Release or a PyPI distribution.

## Phase 1 — architecture

The existing application is a setuptools/pyproject Python CLI, FastAPI HTTP backend, WebSocket text hub, filesystem manager and framework-free HTML/CSS/JavaScript frontend. Its default is a public LAN share, not an account service.

Changed modules: `config.py`, `cli.py`, `access.py`, `server.py`, `file_manager.py`, `clipboard.py`, `websocket.py`, `models.py`; HTML/CSS/JS; tests, packaging, CI, example YAML and the two READMEs. New modules are `tls.py` and `archives.py`.

## Phase 2 — backend and CLI

- Added named port/bind aliases without removing positional port, `--host`, `--max-upload-size`, token or file-only read-only behavior.
- Added optional Basic credentials, a PIN bootstrap with bounded attempt tracking, and a random mount prefix. A prefixed browser UI uses relative assets and a common URL builder for API/download/WebSocket requests.
- `readonly` denies file and text mutation. `droponly` denies listing, downloads, text/image reads, ZIP and folder creation; WebSocket connections receive no previous content and submissions do not broadcast to other senders. Text submissions are saved to unique files for the host operator.
- Added PUT `/upload/<filename>`, GET/POST `/api/clipboard/raw`, JSON/native-form ZIP download and validated image-reference publication. The spec permits a PUT upload alternative, so no multipart dependency was introduced.
- Retained streamed FileResponse downloads, including Range/HEAD, with an explicit Starlette minimum. Upload disk work uses 64 KiB chunks and thread dispatch. ZIPs are disk-backed and unlinked after a response, including disconnects. Text requests have bounded byte collection.
- Upload conflicts still return 409 by default for compatibility. `--rename-on-conflict` opts into numbered names without overwriting. Non-hardlink filesystems hide an unfinished exclusive destination and clean it up on failure.
- Temporary one-day TLS uses installed OpenSSL or the optional cryptography extra. It does not modify device trust or browser security. Keys live in a hidden private temporary directory and are removed at process exit.
- Interface enumeration uses the small pure-Python `ifaddr` dependency; virtual interfaces and loopback/link-local addresses are filtered, with explicit bind as the multi-adapter escape hatch.

## Phase 3 — browser

- A common text-copy helper falls back after unavailable/denied Clipboard API calls. Image copying opens an explicit preview when it cannot complete. Decoding/copying very large images is capped; downloads remain available.
- Global paste respects ordinary input fields, handles text/images/files, and timestamps clipboard image blobs. Drag/drop works over the page. Upload queues retain their original destination and show average speed and ETA.
- Images are normal shared files with small WebSocket references; they are never embedded as huge clipboard payloads. PNG/JPEG/WebP signatures and extension policy are enforced. Active frontend formats remain attachments, not inline image previews.
- Multi-select uses native form attachment downloads so large ZIPs do not become in-memory browser Blobs. Browser testing caught Chromium's null Origin behavior under `no-referrer`; responses now use `same-origin`, keeping cross-origin referrers private while allowing the normal same-origin POST guard.
- Inbox text is explicitly submitted, rather than saving every keystroke. Read-only controls mirror server-side permissions.

## Phase 4 — validation and docs

Both READMEs include badges, language links, uvx/pipx/normal installation, all CLI options, permission semantics, curl examples, private-prefix usage and HTTPS trust limits. The preview notice distinguishes unshipped 0.3.0 features from registry installs. The real-browser demo is regenerated from the current UI.

Local test suites cover authentication, traversal, private files, HTTP/WebSocket modes, text and image publication, chunk limits, upload cancellation, fallback filesystems, numbered Unicode names, native ZIP forms, Range/HEAD and verified TLS handshakes. The two Chromium suites cover the original workflow and new global paste/drop/ZIP/protected-prefix/mode behavior. Tests use synthetic content and disposable shares. Physical iOS/Android and OS-native photo picker behavior are not claimed as tested.

CI retains Linux/macOS/Windows with Python 3.10–3.14, now tests the TLS extra, and runs both browser suites. Official action releases were checked before updating deprecated action runtimes: [setup-python v7.0.0](https://github.com/actions/setup-python/releases/tag/v7.0.0), [setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0), [upload-artifact v7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2), [download-artifact v8.0.2](https://github.com/actions/download-artifact/releases/tag/v8.0.2). Per-branch concurrency cancels superseded/duplicate CI runs.

## Deliberate compatibility choices

- No flags still means `0.0.0.0:8000`, current folder, no login, full mode and the existing 1 GiB per-file limit. Unlimited uploads require explicit zero.
- Legacy `--read-only` remains file-only; new `--mode readonly` protects shared text too.
- This remains browser text/image sharing, not automatic OS clipboard capture.
- Self-signed HTTPS is implemented but is not advertised as automatic trusted clipboard access.
- The app keeps its trusted-LAN threat model. No account database, cloud relay, forced authentication, trust-store mutation, or public-internet hosting guarantee was added.

## Independent review follow-up

The separate review chat found one P1 and two P2 issues in drop-only draft handling and storage messaging. All three were corrected and independently rechecked; `vnext-review.md` retains the original reproduction evidence and final closure. Editing versions and sent snapshots now prevent an old ACK from clearing a newer draft. Global paste marks an unsent draft before deciding whether to send, and the inbox UI describes disk persistence. A real WebSocket proxy delays ACKs by 350 ms in the regression suite; reconnecting unsubmitted pasted text is also covered.

Final local unit runs: 57 passed on Python 3.12 and 3.15. Both Chromium suites passed over a real LAN HTTP address, including the review regressions. A separate real curl check uploaded 128 MiB, resumed a partial download, and verified SHA-256. Sampled server RSS grew from 58,928 KiB to 60,992 KiB (2,064 KiB); this measurement is a concrete local check, not a guarantee for every OS or workload. Final remote CI is required before merge.
