# Release runbook — next version 0.3.0

Version 0.2.0 is already [published](https://pypi.org/project/sharedserver/0.2.0/). Version 0.3.0 is a source preview. The current task authorizes review and GitHub merge, not a new PyPI publication.

1. Read `vnext-implementation.md` and `vnext-review.md`. Resolve blocking review findings and wait for the final PR head's CI. CI covers Python 3.10–3.14 on Linux/macOS/Windows, the optional TLS extra, two Chromium suites, builds and installed assets.
2. After merge, confirm the absolute README image and bilingual-document links load publicly. A Twine check does not test image URLs.
3. Before promoting phone compatibility, check an actual iOS/Android device on the same Wi-Fi: QR → text copy/paste → image preview/copy fallback → native photo picker upload → desktop download. Test private links and the relevant permission modes. Chromium's mobile viewport is not a physical-phone test.
4. When a release is separately authorized, remove the source-preview notices from both READMEs. Check metadata and `sharedserver.__version__` agree on `0.3.0`. Do not republish an existing PyPI version.
5. Run `python -m pytest`, `python -m build`, and `python -m twine check dist/*`. Install the wheel outside the checkout and check CLI, web assets and optional TLS. Confirm the source archive includes both READMEs, assets, tests and browser reproduction scripts.
6. Publish a GitHub Release tagged `v0.3.0` on the reviewed commit. `publish.yml` checks the tag/version, tests, builds and validates the package before uploading with the existing PyPI Trusted Publisher and `pypi` environment. Do not change trust settings or add API tokens to the repository.
7. Verify the successful publish job and public PyPI version. In a clean environment install `sharedserver==0.3.0` from PyPI, run `--version`/`--help`, and execute the smoke suites against that installed package. Verify the PyPI description and image links.
8. Recheck community rules before adapting the older drafts in `promotion-review.md`. Disclose authorship and the actual use of AI assistance. Do not claim automatic OS clipboard synchronization or automatically trusted self-signed HTTPS.

## Reproduce the demo and browser checks

```bash
python -m pip install Pillow
npm install --no-save playwright
npx playwright install chromium
SHARED_PYTHON=.venv/bin/python LAN_SMOKE=1 node scripts/browser_vnext.cjs
SHARED_PYTHON=.venv/bin/python CAPTURE_DEMO=1 LAN_SMOKE=1 node scripts/browser_smoke.cjs
python scripts/render_demo.py
```

Omit `LAN_SMOKE=1` for localhost-only CI checks. The scripts use disposable shares and synthetic content. Set environment variables using the syntax for your shell. Demo captions identify a mobile-sized browser session rather than a physical phone. TLS tests verify a generated LAN certificate through an explicit test trust context; the product never installs a certificate into an OS/browser trust store.
