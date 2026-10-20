# SharedServer promotion and first-use review

Checked: **2026-10-20 (Asia/Shanghai)**. Scope: the uncommitted working tree on `feat/scan-share-security`, package version 0.2.0. This is a review of a development version, not an announcement of a published release. No source files were changed and nothing was published.

## Decision

The positioning is credible: **a temporary LAN file server with uploads, a browser-to-browser text box, and terminal QR access**. Keep that narrow promise. Default login-free access, optional token links, file-only read-only mode, and Python 3.10+ match the implementation. There is no need to add accounts, discovery services, cloud relays, or a native clipboard bridge to make this promotable.

**Follow-up review, same date:** the main chat implemented the development-version notice, absolute image URLs with a PNG terminal preview, installation recovery guidance, a release checklist, LAN-HTTP smoke coverage, and a better default IPv4 candidate selection. I reread those changes and independently reran the suite: **32 passed**. The main chat reports the LAN smoke passed; I inspected its assertions rather than independently repeating that browser run. There is no newly identified P0 source-code defect. The remaining P0 items are release gates, already tracked in `docs/releasing.md`; the remaining small edits are below.

## Prioritized actions

| Priority | Finding and evidence | Concrete action and acceptance check |
| --- | --- | --- |
| P0 release gate; documentation fixed | **Published package versus development checkout.** The live [PyPI project](https://pypi.org/project/sharedserver/) and JSON API returned **0.1.0**, uploaded 2026-07-21. README now explicitly says the new features belong to unreleased 0.2.0 and gives `python -m pip install .`. | Follow `docs/releasing.md` before promoting 0.2.0: merge/CI, authorized release, then a clean PyPI install confirming version and new switches. One easy final edit: put the preview notice **before** the initial package install block, so readers see it before copying the old-release command. |
| P0 release gate; image paths fixed | **Public asset availability.** README now uses absolute raw GitHub URLs for terminal PNG and demo GIF and explains that they become available after merge. This fixes the original relative-image problem at source level; it does not make an unpublished asset public. | After merge, confirm both URLs return image content and visually check the package description. `twine check` alone does not prove URL availability. This gate is already in `docs/releasing.md`. Small remaining link edit: change `[sharedserver.example.yaml](sharedserver.example.yaml)` and `[MIT license](LICENSE)` to absolute repository URLs too, since PyPI is not a repository checkout. |
| P1 small README edit | **The default-access notice still follows both large images.** The initial command shares the current folder with every reachable device. The terminal warning is correct, but users choose their folder before seeing it. | Move the existing trusted-Wi-Fi / optional `--token` note before the screenshots, next to the first-use command, and add “use a dedicated transfer folder.” This needs no behavior change or extra tests. |
| P2 optional polish; recovery guidance added | **Installation recovery now exists.** README explains `python -m sharedserver`, virtual environments and optional pipx. It still assumes readers know how to create/activate a venv. [PyPA explains managed-environment behavior](https://packaging.python.org/en/latest/specifications/externally-managed-environments/). | A short link near installation to an explicit Windows/macOS/Linux venv recipe would improve beginner recovery. This is no longer a launch blocker. Interpreter-bound `python -m pip` in the first block would also reduce ambiguity. |

**Small follow-up, not a launch blocker:** HTTP LAN pages still show an image “Copy” button although its handler immediately says copying is unavailable. Hide/disable that action when the required clipboard capability is absent, with “Download” remaining obvious. The page-level help already explains the limitation; this would prevent a predictable failed tap. Text-copy fallback must remain available.

## What was verified

Read `README.md`, demo assets, `pyproject.toml`, `MANIFEST.in`, CLI/config/access/security/file/server/WebSocket code, HTML/CSS/JS, both CI workflows, browser smoke, release checklist, and relevant tests. Independently ran `.venv312/bin/python -m pytest -q -p no:cacheprovider`: initially 28 passed; after follow-up changes, **32 passed**. CLI help contains the documented new switches.

| Claim | Finding |
| --- | --- |
| Zero application configuration; no login by default | Default config binds `0.0.0.0:8000`, shares the current folder, and accepts requests without a token. Existing `sharedserver.yaml` is auto-loaded, as documented. “Zero configuration” should not imply firewall/VPN/guest-network setup never matters. |
| Optional private QR link | `--token` generates a random token; private root links establish an HttpOnly, SameSite session cookie and redirect to `/`. Assets, API, downloads and WebSockets are guarded; tests cover denied access and restart expiry. A link is a bearer secret, **not traffic encryption**. README states that HTTP is unencrypted. |
| Read-only | Upload and directory creation are rejected server-side and hidden in the UI. Shared text remains editable. The CLI/README explain this accurately. Never shorten the claim to “read-only server.” |
| Text clipboard | Manual paste/type into the browser box, live WebSocket sync, user-triggered Copy. No automatic OS clipboard read. README and UI now make the boundary clear. Image upload is supported; image clipboard copying is a separate browser capability. |
| Mobile upload and QR | A standard multiple-file input and upload progress exist. QR defaults to interactive terminals; `--qr` forces it. Explicit IPv4 bind is reflected in its URL. SVG is an illustrative QR/address, not a live invitation to the viewer's server. |
| Python / platforms | Metadata requires Python >=3.10. CI **configuration** covers Linux/macOS/Windows and Python 3.10–3.14; that is not evidence that remote CI already passed. Main chat separately reports 3.12 and 3.15 tests passing. |
| Publishing | A published GitHub Release triggers tests/build/Twine validation, then a separate Trusted Publishing job in the `pypi` environment. Tag/version equality is checked. The PyPI trusted-publisher account settings and environment protection cannot be established by reading YAML. |

### Demo and browser evidence limits

The initially reviewed `demo.gif` was 1110×736, five frames, approximately 12 seconds and 282 KiB. I extracted and inspected its opening and final frames: clean desktop/mobile composition, legible captions, live text and uploaded filename visible. Main chat subsequently regenerated the demo using the LAN-HTTP path and added a scroll to show the phone file list; I have reviewed the updated script and caption, not re-inspected every regenerated frame. Keeping the “mobile-sized browser session” caption is honest. The terminal preview clearly labels its address as an example.

The original `scripts/browser_smoke.cjs` uses two Chromium contexts at `127.0.0.1`, grants clipboard permissions, injects a screenshot through `setInputFiles`, and verifies uploaded bytes on disk. This proves useful browser behavior but not a physical phone camera scan, native photo picker, Safari behavior, or ordinary HTTP LAN clipboard restrictions. Its final caption mentions downloading; the script does not actually click a download.

**Follow-up:** main chat reports successful `LAN_SMOKE=1` over an actual private IPv4 address. The script now explicitly asserts `window.isSecureContext === false` in the phone context. This closes the missing HTTP-context coverage; file upload, sync and reconnect also pass according to the main chat. **Evidence limit remains:** Copy checks the success toast after the real fallback runs, not a read-back of the OS clipboard. Do not describe this as an assertion of clipboard contents. Optional strengthening: read the clipboard through the trusted localhost context and compare the expected string after the LAN-page click. The smoke still does not click a browser download. API tests cover downloaded bytes; these are distinct claims.

`docs/releasing.md` correctly records physical-phone verification as outstanding. Before saying “tested on iPhone/Android,” manually check scan → browser → paste/copy → photo upload → desktop Refresh/download on those devices. This is a focused release check, not a request to build a browser lab. The revised IP chooser improves the VPN case but cannot identify the correct network in every multi-adapter setup; keep the explicit `--host` troubleshooting step.

README already covers guest isolation, firewall, wrong adapter/VPN, occupied port, and non-interactive QR. These are good first-failure instructions. File lists refresh explicitly; only text is live-synced. Do not advertise automatic file-list synchronization, resumable transfers, internet sharing, end-to-end encryption, or per-user permissions.

## Position and channels

The most defensible distinction is the **combination** of familiar Python launch, temporary directory sharing, a browser text scratchpad, and a phone browser. Do not claim QR/upload alone is novel: [miniserve](https://github.com/svenstaro/miniserve) already documents both, plus authentication/TLS. [copyparty](https://github.com/9001/copyparty) has a much broader file-server feature set, resumable uploads and multiple installation paths. [croc](https://github.com/schollz/croc) documents encrypted transfers and relay support, including a browser client. SharedServer should compete on its focused workflow, not unmeasured speed, security superlatives, or “the only app-free solution.”

Recommended order: finish the small README edits → complete `docs/releasing.md` and publish only when separately authorized → verify fresh package and public images → one V2EX introduction and an r/Python showcase-thread comment → assess genuine user problems before broader posting. For r/selfhosted, use a new-project thread first. Collect actionable reports with OS, browser, Python version, install/start command **without tokens**, and the failing step. There is no need to add analytics to the server.

### Community rules checked on 2026-10-20

- **V2EX:** [分享创造](https://www.v2ex.com/go/create) explicitly welcomes members' own new work. [Site rules](https://www.v2ex.com/about) stress original work, civility and avoiding spam. This is a suitable original open-source project introduction; do not post repeated promotional duplicates or request stars/upvotes. No account eligibility was checked.
- **r/Python:** The [current sidebar rules](https://www.reddit.com/r/Python/) say **“No showcase posts”** and direct showcases to the monthly showcase or daily threads. Older rules about showcase flairs/sections remain in the sidebar; do not interpret those as permission for a standalone post. Use the [currently linked Showcase Thread](https://www.reddit.com/r/Python/comments/1wxjay5/showcase_thread/), rechecking the pinned thread when posting. Include description, Python relevance and source; the draft uses the requested What/Target/Comparison structure.
- **r/selfhosted:** [Rules](https://www.reddit.com/r/selfhosted/) require relevant English content and usable, documented promoted software, discourage excessive self-promotion, and restrict projects younger than three months to the current New Project Megathread. The [15 Oct thread](https://www.reddit.com/r/selfhosted/comments/1x6ywou/new_project_megathread_week_of_15_oct_2026/) is currently linked. Public PyPI presence is dated July 21, so **do not assume three months have elapsed on October 20**; an earlier public commit would need evidence. Local author timestamps are insufficient. The [moderator update](https://www.reddit.com/r/selfhosted/comments/1sey9ch/quarter_2_update_revisiting_rules_again/) also discusses AI involvement disclosure: answer any bot prompt truthfully and recheck current flair instructions. Do not claim “production ready” just to meet a rule while the package is classified Alpha.

## Reviewable drafts — do not publish automatically

**Release condition for all drafts:** these describe 0.2.0 after it is publicly available and verified. Until then, change the opening to “0.2.0 development preview” and replace package commands with a verified public source install; do not send readers to 0.1.0 expecting the new switches. Links below identify the repository, not a claim that the current branch is published.

### V2EX / 分享创造

Title: **SharedServer：像 http.server 一样启动，手机扫码传文件，也能共享一段文字**

我做了一个临时局域网共享工具 SharedServer，MIT 开源，用 Python 3.10+ 运行。适合电脑和手机在同一 Wi-Fi 下临时传文件，或者把一段文字从一个设备送到另一个设备。

在准备共享的文件夹中运行：

```bash
python -m pip install sharedserver
sharedserver
```

手机扫终端二维码，在浏览器里下载文件、上传照片或文件；网页文本框中的内容会同步到其他已打开页面，接收设备点 Copy text 即可复制。手机不需要安装配套 App，也不会自动读取系统剪贴板。

默认无登录，所有能连到服务的设备都能访问，所以请使用可信 Wi-Fi 和专门的传输目录。`sharedserver --token` 可生成无需登录页的私密扫码链接；`--read-only` 禁止文件写入，文字仍可编辑。HTTP 不加密，不适合直接暴露公网。用完 Ctrl+C 关闭。

源码、短演示和连接排错：[GitHub](https://github.com/NihaoKangkang/sharedserver)。如果试用时卡住，欢迎告诉我系统、浏览器和具体步骤；请不要贴出带 token 的链接。

### r/Python — comment in the current Showcase Thread

**SharedServer: temporary LAN files and browser text sharing from a Python command**

**What My Project Does:** I maintain SharedServer, an MIT-licensed Python 3.10+ CLI. Run it in a transfer folder and scan the terminal QR on another device. Its browser page supports uploads, downloads and a live plain-text box. The Python backend uses FastAPI and WebSockets; it does not read the OS clipboard automatically.

```bash
python -m pip install sharedserver
sharedserver
```

**Target Audience:** People moving a file or a text snippet between devices on trusted Wi-Fi. This is a temporary LAN utility. Default access is open to reachable devices; `--token` adds a private link without a login screen. `--read-only` disables file writes while leaving shared text editable. HTTP traffic is unencrypted.

**Comparison:** miniserve already handles quick HTTP file sharing and QR access, and copyparty offers many more server features. SharedServer focuses on combining folder transfers with an in-page text scratchpad in a Python CLI.

[Source and demo](https://github.com/NihaoKangkang/sharedserver). Feedback on installation and the phone-browser workflow would be useful; include OS/browser and omit token links from reports.

### r/selfhosted — comment in the current New Project Megathread

**SharedServer — a temporary LAN drop folder and shared text box (MIT, Python 3.10+)**

I'm the maintainer. SharedServer runs on your own computer and serves files plus an in-memory text box to browsers on your LAN. It is useful when you want to move a photo, document or short text snippet between devices without creating accounts or running a persistent cloud service.

Run `python -m pip install sharedserver`, then `sharedserver` inside a dedicated transfer folder. Scan its terminal QR from a phone browser. The page supports uploads, folder browsing and downloads; text updates between open pages. Other file lists update with Refresh.

Default access is open to every reachable device. `sharedserver --token` creates a private link; `--read-only` disables uploads and folder creation but keeps text editable. This remains an alpha LAN utility: HTTP is not encrypted, and it should not be exposed directly to the internet. Stop it with Ctrl+C after use.

[Source, demo and setup](https://github.com/NihaoKangkang/sharedserver). I would appreciate concrete install or mobile-browser failure reports. AI assistance was used for this promotion review and draft; the maintainer should describe the actual development involvement accurately if asked by the thread or bot.

## Final implementation follow-up

The main chat applied the remaining small edits after this review: the development notice now precedes the install block, the default-access note and dedicated-folder advice precede the images, YAML/license links use absolute GitHub URLs, and installation recovery links to PyPA's virtual-environment guide. Unsupported image-copy actions are hidden while downloads remain available.

The strengthened LAN-HTTP browser smoke now reads the copied text back through the trusted localhost context and compares the exact string. It also clicks the browser download link and compares downloaded image bytes. These checks passed. Final unit runs on Python 3.12 and 3.15 each passed **36 tests**. Physical-phone, remote-CI, and published-package checks remain release gates; no community posts or PyPI release were made.
