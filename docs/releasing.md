# Release checklist for 0.2.0

The changes in this branch are a development preview. They have not been published to PyPI.

1. Merge the reviewed changes after CI is green. CI covers Python 3.10–3.14 on Linux, macOS, and Windows, plus a Chromium browser smoke test. Local checks cover Python 3.12 and 3.15 and Chromium over both localhost and a LAN HTTP IP; this is not a physical iOS / Android test.
2. Confirm the README images at `raw.githubusercontent.com/NihaoKangkang/sharedserver/main/docs/assets/` load publicly after merge. Images use absolute URLs for PyPI. The source SVG and rendered PNG are included.
3. Test on a physical phone on the same Wi-Fi: scan the terminal QR code, copy text in both directions, upload a photo, and download it. Repeat with `--token` and check the URL is cleaned. Try `--read-only` and confirm file writes are unavailable.
4. Configure the PyPI trusted publisher for this repository's `publish.yml` workflow and the `pypi` GitHub environment. No API token needs to be committed.
5. Remove the development-preview paragraph and preview-only image-availability sentence from the README. Verify `pyproject.toml` and `sharedserver.__version__` both say `0.2.0`.
6. Run `python -m pytest`, `python -m build`, and `python -m twine check dist/*`. Install the wheel in a clean environment and check the packaged web UI. Verify the source distribution includes demo assets and scripts.
7. Publish a GitHub Release tagged `v0.2.0`. The existing release workflow verifies the version tag, tests, builds, and publishes using Trusted Publishing. Do not publish a version that already exists on PyPI.
8. From another clean environment, install `sharedserver==0.2.0` from PyPI. Check `sharedserver --version`, `--token`, `--read-only`, and `--qr`. Inspect PyPI's README images.
9. Only then use the community drafts in `promotion-review.md`. Recheck the current community rules and disclose authorship. Do not describe this tool as automatic OS clipboard synchronization.

## Reproduce the short demo

Install optional media tools separately from the application:

```bash
pip install Pillow
npm install --no-save playwright
npx playwright install chromium
SHARED_PYTHON=.venv/bin/python CAPTURE_DEMO=1 LAN_SMOKE=1 node scripts/browser_smoke.cjs
python scripts/render_demo.py
```

`LAN_SMOKE=1` uses the printed LAN IP in the mobile browser context and asserts that it is an ordinary HTTP context. Omit it for a localhost-only CI run. On Windows, set these environment variables using your shell's syntax. The smoke test creates and removes its own temporary share; captures contain synthetic text and a browser screenshot uploaded as a PNG.
