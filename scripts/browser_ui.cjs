// UI regression checks against a disposable local service, never a user share.
// Install Playwright and jsqr for tests only. JSQR_MODULE can point to jsQR.js.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const jsQR = require(process.env.JSQR_MODULE || "jsqr");
const python = process.env.SHARED_PYTHON || "python";
const screenshots = path.resolve("build/ui-screenshots");
const evidence = [];
async function port() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const result = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return result;
}
async function start(args = [], seed = true) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "sharedserver-ui-"));
  if (seed) {
    await fs.mkdir(path.join(folder, "folder-with-a-long-name"));
    await fs.mkdir(
      path.join(
        folder,
        "folder-with-a-long-name",
        "nested-path-segment".repeat(5),
      ),
      { recursive: true },
    );
    await fs.writeFile(
      path.join(
        folder,
        "folder-with-a-long-name",
        "nested-path-segment".repeat(5),
        "deep.txt",
      ),
      "deep path",
    );
    await fs.writeFile(
      path.join(folder, "hello.txt"),
      "Hello from a safe text preview.\n",
    );
    await fs.writeFile(
      path.join(folder, "unsafe.html"),
      "<script>globalThis.previewExecuted=true</script><h1>Literal content</h1>",
    );
    await fs.writeFile(path.join(folder, "z-last.mp4"), "not a playable video");
    await fs.writeFile(
      path.join(folder, `${"LongName".repeat(29)}.txt`),
      "long name",
    );
    await fs.writeFile(
      path.join(folder, `-quotes'\"\x60$(touch INJECTED)&[]#%\u4e2d\u6587.txt`),
      "shell-safe content",
    );
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO1sAAAAASUVORK5CYII=",
      "base64",
    );
    await fs.writeFile(path.join(folder, "tiny.png"), png);
    await fs.writeFile(path.join(folder, "fake.png"), "not an image");
  }
  const listen = await port();
  const child = spawn(python, [
    "-m",
    "sharedserver",
    String(listen),
    "-b",
    process.env.LAN_SMOKE === "1" ? "0.0.0.0" : "127.0.0.1",
    "-d",
    folder,
    "--no-qr",
    ...args,
  ]);
  let output = "";
  child.stdout.on("data", (data) => (output += data));
  child.stderr.on("data", (data) => (output += data));
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(output);
    if (output.includes("Ctrl+C")) {
      const local = output.match(/Local:\s+(http:\/\/\S+)/)?.[1];
      const lan = output.match(/LAN:\s+(http:\/\/\S+)/)?.[1] || local;
      try {
        if ((await fetch(local)).status < 500)
          return {
            folder,
            local,
            lan,
            stop: async () => {
              child.kill("SIGINT");
              await new Promise((resolve) =>
                child.exitCode !== null
                  ? resolve()
                  : child.once("exit", resolve),
              );
              await fs.rm(folder, { recursive: true, force: true });
            },
          };
      } catch (_) {
        /* Wait until the listening socket is ready. */
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill("SIGINT");
  throw new Error(output);
}
async function workspace(page, name) {
  const tab = page.locator(`#tab-${name}`);
  if (await tab.isVisible()) await tab.click();
}
async function ready(page, url) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => !document.querySelector("#shared-text").disabled,
  );
}
async function closeToast(page) {
  const dismiss = page.getByRole("button", { name: "Dismiss notification" });
  if (await dismiss.isVisible()) await dismiss.click();
}
async function fits(page, label) {
  const problems = await page.evaluate(async () => {
    const problems = [],
      root = document.documentElement;
    if (root.scrollWidth > root.clientWidth)
      problems.push(
        `document overflow ${root.scrollWidth}/${root.clientWidth}`,
      );
    for (const element of document.querySelectorAll(
      "button,a,input,select,summary,textarea",
    )) {
      if (
        !element.getClientRects().length ||
        element.closest("[hidden], [inert]") ||
        element.classList.contains("skip-link")
      )
        continue;
      const closedDetails = element.closest("details:not([open])");
      if (closedDetails && !element.matches("summary")) continue;
      const modal = document.querySelector("dialog[open]");
      if (modal && !modal.contains(element)) continue;
      const target =
        element.type === "checkbox" ? element.closest("label") : element;
      const name =
        element.getAttribute("aria-label") ||
        element.id ||
        element.textContent.slice(0, 35);
      if (!target) {
        problems.push(`missing label: ${name}`);
        continue;
      }
      target.scrollIntoView({ block: "center", inline: "nearest" });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const r = target.getBoundingClientRect();
      if (r.width < 43.9 || r.height < 43.9)
        problems.push(`small ${name}: ${r.width}x${r.height}`);
      if (r.left < -0.5 || r.right > root.clientWidth + 0.5)
        problems.push(`clipped ${name}: ${r.left}/${r.right}`);
      if (r.top < -0.5 || r.bottom > innerHeight + 0.5)
        problems.push(`vertical ${name}: ${r.top}/${r.bottom}`);
      const hit = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      if (!target.contains(hit) && !hit?.contains(target))
        problems.push(`covered ${name} by ${hit?.tagName}.${hit?.className}`);
    }
    return problems;
  });
  assert.deepEqual(problems, [], label);
  evidence.push(label);
}
async function headerTool(page, selector) {
  if (!(await page.locator(selector).isVisible()))
    await page.getByLabel("More workspace tools", { exact: true }).click();
  await page.locator(selector).click();
}
async function menuFor(page, name) {
  await page.getByLabel(`More actions for ${name}`, { exact: true }).click();
}
async function decodeQr(page) {
  const pixels = await page.locator("#share-qr").evaluate((canvas) => ({
    width: canvas.width,
    height: canvas.height,
    data: [
      ...canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height)
        .data,
    ],
  }));
  return jsQR(Uint8ClampedArray.from(pixels.data), pixels.width, pixels.height)
    ?.data;
}
(async () => {
  await fs.mkdir(screenshots, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  let server;
  try {
    server = await start();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage(),
      errors = [],
      violations = [],
      external = [];
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) =>
        (globalThis.cspErrors ||= []).push(e.violatedDirective),
      );
    });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (!r.url().startsWith(new URL(server.local).origin))
        external.push(r.url());
    });
    await ready(page, server.local);
    for (const width of process.env.UI_FAST
      ? []
      : [320, 360, 390, 430, 767, 768, 820, 960, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1080 });
      for (const theme of ["light", "dark"]) {
        await page.locator("#theme-select").selectOption(theme);
        await workspace(page, "files");
        const contrast = await page.locator("#choose-files").evaluate((el) => {
          const style = getComputedStyle(el);
          const luminance = (color) =>
            color
              .match(/[\d.]+/g)
              .slice(0, 3)
              .map(Number)
              .map((value) => {
                const c = value / 255;
                return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
              })
              .reduce(
                (sum, value, index) =>
                  sum + value * [0.2126, 0.7152, 0.0722][index],
                0,
              );
          const values = [
            luminance(style.color),
            luminance(style.backgroundColor),
          ].sort((a, b) => a - b);
          return (values[1] + 0.05) / (values[0] + 0.05);
        });
        assert.ok(
          contrast >= 4.5,
          `${theme} primary button contrast ${contrast}`,
        );
        await fits(page, `${width} files ${theme}`);
        await menuFor(page, "hello.txt");
        const menuProblems = await page
          .locator("details[open] .action-menu")
          .evaluate((menu) =>
            [...menu.querySelectorAll("button")].flatMap((button) => {
              const r = button.getBoundingClientRect(),
                hit = document.elementFromPoint(
                  r.x + r.width / 2,
                  r.y + r.height / 2,
                );
              return r.left < 0 ||
                r.right > document.documentElement.clientWidth ||
                r.top < 0 ||
                r.bottom > innerHeight ||
                !button.contains(hit)
                ? [button.textContent]
                : [];
            }),
          );
        assert.deepEqual(menuProblems, [], `more menu ${width} ${theme}`);
        await page.keyboard.press("Escape");
        assert.equal(await page.locator("thead").isVisible(), width >= 768);
        assert.equal(
          await page.locator(".workspace-tabs").isVisible(),
          width < 1024,
        );
        if (width === 320 || width === 1280) {
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({
            path: path.join(screenshots, `${width}-files-${theme}.png`),
            fullPage: true,
          });
        }
        await workspace(page, "clipboard");
        await fits(page, `${width} clipboard ${theme}`);
      }
    }
    for (const [width, height] of process.env.UI_FAST
      ? []
      : [
          [320, 568],
          [390, 400],
          [844, 390],
          [1024, 480],
          [1280, 480],
        ]) {
      await page.setViewportSize({ width, height });
      await workspace(page, "files");
      await fits(page, `${width}x${height} short`);
      await workspace(page, "clipboard");
      await fits(page, `${width}x${height} text short`);
      if (width >= 1024)
        assert.equal(
          await page
            .locator("#clipboard-panel")
            .evaluate((el) => getComputedStyle(el).position),
          "static",
        );
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    // Browser settings persist across navigation; system follows changes only in System mode.
    await page.locator("#theme-select").selectOption("light");
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      "light",
    );
    await page.emulateMedia({ colorScheme: "dark" });
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      "light",
    );
    await page.locator("#theme-select").selectOption("system");
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "light",
    );
    // Search, stable selection, empty results and failure retain the snapshot.
    await workspace(page, "files");
    await page
      .getByRole("checkbox", { name: "Select hello.txt", exact: true })
      .check();
    await page.locator("#file-sort").selectOption("size-desc");
    assert.equal(
      await page
        .getByRole("checkbox", { name: "Select hello.txt", exact: true })
        .isChecked(),
      true,
    );
    await page.locator("#file-search").fill("tiny");
    assert.match(await page.locator("#download-zip").textContent(), /\(0\)/);
    await page.locator("#file-search").fill("no-such-file");
    assert.equal(
      await page.locator("#empty-message").textContent(),
      "No results",
    );
    await page.locator("#clear-filter").click();
    await page.route("**/api/files?*", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: '{"detail":"Synthetic listing failure"}',
      }),
    );
    await page.locator("#refresh-files").click();
    await page.getByText(/Showing the previous folder snapshot/).waitFor();
    assert.equal(
      await page
        .getByRole("checkbox", { name: "Select hello.txt", exact: true })
        .count(),
      1,
    );
    await page.unroute("**/api/files?*");
    await closeToast(page);
    await page.locator("#retry-files").click();
    // Deep paths keep their own local breadcrumb scroll without clipping controls.
    await page
      .getByRole("button", { name: "folder-with-a-long-name", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "nested-path-segment".repeat(5),
        exact: true,
      })
      .click();
    await page
      .getByRole("checkbox", { name: "Select deep.txt", exact: true })
      .waitFor();
    await page.setViewportSize({ width: 320, height: 568 });
    await workspace(page, "files");
    await fits(page, "deep path 320");
    await page
      .getByRole("button", { name: "Shared folder", exact: true })
      .click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page
      .getByRole("checkbox", { name: "Select hello.txt", exact: true })
      .waitFor();
    // A slow earlier navigation may never replace a newer successful one.
    let releaseListing;
    const listingGate = new Promise((resolve) => (releaseListing = resolve));
    await page.route("**/api/files?*", async (route) => {
      if (
        new URL(route.request().url()).searchParams.get("path") ===
        "folder-with-a-long-name"
      )
        await listingGate;
      await route.continue();
    });
    await page
      .getByRole("button", { name: "folder-with-a-long-name", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Shared folder", exact: true })
      .click();
    await page.locator("#listing-status").waitFor({ state: "hidden" });
    releaseListing();
    await page.unrouteAll({ behavior: "wait" });
    assert.equal(
      await page.locator("#breadcrumbs").textContent(),
      "Shared folder",
    );
    // Preview must not execute active formats. Escape restores the trigger's focus.
    await menuFor(page, "unsafe.html");
    await page
      .locator("details[open]")
      .getByRole("button", { name: "Preview unsafe.html", exact: true })
      .click();
    await page
      .locator("#text-preview-content")
      .filter({ hasText: "<script>" })
      .waitFor();
    assert.equal(
      await page.evaluate(() => globalThis.previewExecuted),
      undefined,
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#text-dialog").isVisible(), false);
    await menuFor(page, "fake.png");
    await page
      .locator("details[open]")
      .getByRole("button", { name: "Preview fake.png", exact: true })
      .click();
    await page
      .getByText("Could not decode this image. Download the original instead.")
      .waitFor();
    await page.locator("#close-image").click();
    await menuFor(page, "tiny.png");
    await page
      .locator("details[open]")
      .getByRole("button", { name: "Preview tiny.png", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelector("#image-preview").naturalWidth > 0,
    );
    await page.locator("#close-image").click();
    // Dialogs remain usable on narrow/short viewports and return keyboard focus.
    for (const [width, height] of [
      [320, 568],
      [768, 900],
      [1024, 480],
    ]) {
      await page.setViewportSize({ width, height });
      await workspace(page, "files");
      await page.locator("#new-folder").click();
      await fits(page, `folder dialog ${width}`);
      await page.keyboard.press("Escape");
      await headerTool(page, "#open-share");
      await fits(page, `share dialog ${width}`);
      await page.keyboard.press("Escape");
      await headerTool(page, "#open-help");
      await fits(page, `help dialog ${width}`);
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    // A QR generated by one implementation must decode independently.
    await headerTool(page, "#open-share");
    await page.locator("#generate-share").click();
    assert.equal(await decodeQr(page), server.local);
    await page.getByLabel("Close sharing", { exact: true }).click();
    assert.equal(await page.locator("#share-link").inputValue(), "");
    // Generated shell commands handle special filenames without executing them.
    const filename = (await fs.readdir(server.folder)).find((n) =>
      n.startsWith("-quotes"),
    );
    await menuFor(page, filename);
    await page
      .locator("details[open]")
      .getByRole("button", { name: `Copy curl for ${filename}`, exact: true })
      .click();
    const command = await page.evaluate(() => navigator.clipboard.readText());
    const output = await fs.mkdtemp(
      path.join(os.tmpdir(), "sharedserver-curl-"),
    );
    const result = await new Promise((resolve) => {
      const child = spawn("/bin/sh", ["-c", command], { cwd: output });
      let stderr = "";
      child.stderr.on("data", (d) => (stderr += d));
      child.on("close", (status) => resolve({ status, stderr }));
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      await fs.readFile(path.join(output, filename), "utf8"),
      "shell-safe content",
    );
    assert.deepEqual(await fs.readdir(output), [filename]);
    await fs.rm(output, { recursive: true, force: true });
    await closeToast(page);
    // Add 201 candidates only after the layout matrix to keep it fast and meaningful.
    for (let i = 0; i < 201; i++)
      await fs.writeFile(
        path.join(server.folder, `selection-${i}.txt`),
        "selection",
      );
    await page.locator("#refresh-files").click();
    await page
      .getByRole("checkbox", { name: "Select selection-200.txt", exact: true })
      .waitFor();
    await page.locator("#file-search").fill("selection-");
    await page.locator("#select-all").click();
    assert.equal(await page.locator(".file-select:checked").count(), 200);
    const unchecked = page.locator(".file-select:not(:checked)").first();
    await unchecked.check().catch(() => {});
    assert.equal(await page.locator(".file-select:checked").count(), 200);
    await page.locator("#file-search").fill("hello");
    await closeToast(page);
    await workspace(page, "clipboard");
    await page.locator("#shared-text").fill("\u{1F600}\nA");
    assert.match(
      await page.locator("#text-statistics").textContent(),
      /3 Characters.*2 lines/,
    );
    assert.match(await page.locator("#character-count").textContent(), /^6 B/);
    await page.locator("#shared-text").fill("x".repeat(5000));
    await page.locator("#wrap-toggle").uncheck();
    assert.equal(
      await page
        .locator("#shared-text")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      true,
    );
    assert.equal(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
      true,
    );
    await page.locator("#wrap-toggle").check();
    await page.evaluate(() => {
      globalThis.originalExec = document.execCommand;
      document.execCommand = () => false;
      globalThis.originalWrite = navigator.clipboard.writeText;
      navigator.clipboard.writeText = () =>
        Promise.reject(new Error("Synthetic clipboard denial"));
    });
    await page.locator("#copy-shared").click();
    await page.locator("#manual-copy-dialog").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#manual-copy-text").inputValue(),
      "x".repeat(5000),
    );
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      document.execCommand = globalThis.originalExec;
      navigator.clipboard.writeText = globalThis.originalWrite;
      delete globalThis.originalExec;
      delete globalThis.originalWrite;
    });
    await workspace(page, "files");
    // Current upload destination is captured before later navigation.
    await page.locator("#file-search").fill("");
    const putRequests = [];
    page.on("request", (r) => {
      if (r.method() === "PUT") putRequests.push(r.url());
    });
    let releasePut;
    const gate = new Promise((resolve) => (releasePut = resolve));
    await page.route("**/api/upload?*", async (route) => {
      await gate;
      await route.continue().catch((error) => {
        if (!/already handled|closed|aborted/.test(error.message)) throw error;
      });
    });
    await page.locator("#file-input").setInputFiles([
      {
        name: "queue-a.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("first"),
      },
      {
        name: "queue-b.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("second"),
      },
    ]);
    await page.evaluate(() => {
      const active = tasks.find((task) => task.request);
      active.request.upload.dispatchEvent(
        new ProgressEvent("progress", {
          lengthComputable: false,
          loaded: 12,
          total: 0,
        }),
      );
    });
    assert.equal(
      await page
        .locator(".upload-item")
        .first()
        .locator("progress")
        .getAttribute("value"),
      null,
    );
    await page
      .getByRole("button", { name: "Cancel queue-b.txt", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cancel queue-a.txt", exact: true })
      .click();
    releasePut();
    await page.unroute("**/api/upload?*");
    await page.locator("#file-input").setInputFiles({
      name: "after-cancel.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("queue still works"),
    });
    await page
      .getByText("Uploaded after-cancel.txt", { exact: true })
      .waitFor();
    assert.equal(
      await fs.readFile(path.join(server.folder, "after-cancel.txt"), "utf8"),
      "queue still works",
    );
    assert.equal(
      putRequests.some((url) => url.includes("queue-b.txt")),
      false,
    );
    await closeToast(page);
    await page.locator("#clear-transfers").click();
    // A queued upload retains its root destination after navigation.
    let releaseDestination;
    const destinationGate = new Promise(
      (resolve) => (releaseDestination = resolve),
    );
    await page.route("**/api/upload?*", async (route) => {
      await destinationGate;
      await route.continue();
    });
    await page.locator("#file-input").setInputFiles({
      name: "fixed-destination.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("root destination"),
    });
    await page
      .getByRole("button", { name: "folder-with-a-long-name", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "nested-path-segment".repeat(5),
        exact: true,
      })
      .waitFor();
    releaseDestination();
    await page.unrouteAll({ behavior: "wait" });
    await page
      .getByText("Uploaded fixed-destination.txt", { exact: true })
      .waitFor();
    assert.equal(
      await fs.readFile(
        path.join(server.folder, "fixed-destination.txt"),
        "utf8",
      ),
      "root destination",
    );
    assert.equal(
      (
        await fs.readdir(path.join(server.folder, "folder-with-a-long-name"))
      ).includes("fixed-destination.txt"),
      false,
    );
    await closeToast(page);
    await page.locator("#clear-transfers").click();
    await page
      .getByRole("button", { name: "Shared folder", exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: "Select hello.txt", exact: true })
      .waitFor();
    // Failed transfers require an explicit retry, and do not block later work.
    let failedOnce = false;
    await page.route("**/api/upload?*", (route) => {
      if (!failedOnce) {
        failedOnce = true;
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: '{"detail":"Synthetic upload failure"}',
        });
      }
      return route.continue();
    });
    await page.locator("#file-input").setInputFiles({
      name: "retry.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("retry succeeds"),
    });
    await page
      .getByRole("button", { name: "Retry retry.txt", exact: true })
      .click();
    await page.getByText("Uploaded retry.txt", { exact: true }).waitFor();
    assert.equal(
      await fs.readFile(path.join(server.folder, "retry.txt"), "utf8"),
      "retry succeeds",
    );
    await page.unroute("**/api/upload?*");
    await closeToast(page);
    await page.setViewportSize({ width: 390, height: 400 });
    await fits(page, "mobile transfer queue");
    await page.locator("#clear-transfers").click();
    await page.setViewportSize({ width: 1280, height: 900 });
    // Clear confirmation is invalidated by an intervening edit.
    await workspace(page, "clipboard");
    await page.locator("#shared-text").fill("before clear");
    await page.waitForFunction(() =>
      document.querySelector("#sync-status").textContent.includes("Confirmed"),
    );
    await page.locator("#clear-text").click();
    await context.request.post(
      new URL("api/clipboard/raw", server.local).href,
      { data: "remote changed" },
    );
    await page.waitForFunction(
      () => document.querySelector("#shared-text").value === "remote changed",
    );
    await page.locator("#confirm-clear").click();
    assert.equal(
      await page.locator("#shared-text").inputValue(),
      "remote changed",
    );
    await closeToast(page);
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    violations.push(...(await page.evaluate(() => globalThis.cspErrors || [])));
    assert.deepEqual(violations, []);
    await context.close();
    await server.stop();
    server = null;

    // No-storage, narrow touch context and permission combinations.
    for (const args of [
      ["--read-only"],
      ["--mode", "readonly"],
      ["--mode", "droponly"],
    ]) {
      server = await start(args, false);
      const c = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      await c.addInitScript(() => {
        Storage.prototype.getItem = () => {
          throw new Error("Storage unavailable");
        };
        Storage.prototype.setItem = () => {
          throw new Error("Storage unavailable");
        };
      });
      const p = await c.newPage(),
        requests = [];
      p.on("request", (r) => requests.push(r.url()));
      await ready(p, server.local);
      const drop = args.includes("droponly"),
        readonly = args.includes("readonly");
      assert.equal(
        await p.locator("#mode-badge").textContent(),
        drop ? "DROP-ONLY" : readonly ? "READ-ONLY" : "FILES READ-ONLY",
      );
      await p.locator("#theme-select").selectOption("dark");
      assert.equal(await p.locator("html").getAttribute("data-theme"), "dark");
      if (drop) {
        assert.equal(
          requests.some((url) => /api\/(files|text|image|download)/.test(url)),
          false,
        );
        await workspace(p, "clipboard");
        await p.locator("#shared-text").fill("local only");
        await p.locator("#clear-text").click();
        await p.locator("#confirm-clear").click();
        assert.equal((await fs.readdir(server.folder)).length, 0);
      } else {
        assert.equal(await p.locator("#choose-files").isVisible(), false);
        await workspace(p, "clipboard");
        assert.equal(
          await p.locator("#shared-text").evaluate((el) => el.readOnly),
          readonly,
        );
      }
      await fits(p, `permissions ${args.join(" ")}`);
      await c.close();
      await server.stop();
      server = null;
    }
    // Protected sharing is explicit and keeps all secrets transient.
    server = await start([
      "--random-url",
      "--auth",
      "test:password",
      "--pin",
      "123456",
    ]);
    const secure = await browser.newContext({
        httpCredentials: { username: "test", password: "password" },
      }),
      p = await secure.newPage();
    await ready(p, server.local);
    assert.equal(new URL(p.url()).search, "");
    await headerTool(p, "#open-share");
    assert.equal(await p.locator("#share-link").inputValue(), "");
    await p.locator("#generate-share").click();
    assert.equal(await p.locator("#share-qr").isVisible(), false);
    await p.locator("#share-link").fill(server.local);
    await p.locator("#generate-share").click();
    assert.equal(await decodeQr(p), server.local);
    await p.locator("#share-link").fill(server.local + "&pin=9999");
    await p.locator("#generate-share").click();
    assert.equal(await p.locator("#share-qr").isVisible(), false);
    await p.getByLabel("Close sharing", { exact: true }).click();
    assert.equal(await p.locator("#share-link").inputValue(), "");
    await menuFor(p, "hello.txt");
    await p
      .locator("details[open]")
      .getByRole("button", { name: "Copy curl for hello.txt", exact: true })
      .click();
    assert.match(await p.locator("#curl-output").inputValue(), /REPLACE_/);
    assert.equal(
      (await p.locator("#curl-output").inputValue()).includes(
        new URL(server.local).pathname,
      ),
      false,
    );
    await p.locator("#share-link").fill(server.local);
    await p.locator("#curl-auth").selectOption("basic-pin");
    await p.locator("#generate-share").click();
    assert.match(
      await p.locator("#curl-output").inputValue(),
      /--user 'USERNAME'/,
    );
    assert.match(await p.locator("#curl-output").inputValue(), /pin=123456/);
    await p.getByLabel("Close sharing", { exact: true }).click();
    assert.equal(await p.locator("#curl-output").inputValue(), "");
    const stored = await p.evaluate(
      () =>
        JSON.stringify({ ...localStorage }) +
        JSON.stringify({ ...sessionStorage }),
    );
    assert.equal(stored.includes("123456"), false);
    assert.equal(stored.includes(new URL(server.local).pathname), false);
    await secure.close();
    await server.stop();
    server = null;
    // Random-path-only sharing must stay private even when private_link is false.
    // Other authentication combinations use the same explicit manual-share flow.
    for (const args of [
      ["--random-url"],
      ["--auth", "test:password"],
      ["--pin", "123456"],
      ["--auth", "test:password", "--token"],
    ]) {
      server = await start(args);
      const c = await browser.newContext(
        args.includes("--auth")
          ? { httpCredentials: { username: "test", password: "password" } }
          : {},
      );
      const p = await c.newPage();
      await ready(p, server.local);
      await headerTool(p, "#open-share");
      assert.equal(await p.locator("#share-link").inputValue(), "");
      await p.locator("#share-link").fill(server.local);
      await p.locator("#generate-share").click();
      assert.equal(await decodeQr(p), server.local);
      await p.getByLabel("Close sharing", { exact: true }).click();
      await menuFor(p, "hello.txt");
      await p
        .locator("details[open]")
        .getByRole("button", { name: "Copy curl for hello.txt", exact: true })
        .click();
      assert.equal(await p.locator("#curl-auth").inputValue(), "unknown");
      assert.match(
        await p.locator("#curl-output").inputValue(),
        /REPLACE_AUTH_OPTIONS/,
      );
      assert.equal(await p.locator("#share-link").inputValue(), "");
      await p.getByLabel("Close sharing", { exact: true }).click();
      await c.close();
      await server.stop();
      server = null;
      evidence.push(
        `authentication ${args.includes("--token") ? "Basic + token" : args[0]}`,
      );
    }
    await fs.writeFile(
      path.resolve("build/ui-evidence.json"),
      JSON.stringify(
        {
          checks: evidence,
          qr: "independent jsQR decode passed",
          browser: "Chromium desktop/mobile emulation",
          physicalPhones: "not tested",
          realZoom: "not tested",
          virtualKeyboard: "not tested",
        },
        null,
        2,
      ),
    );
    console.log(
      `UI checks passed: ${evidence.length} layout/permission cases, search/selection, previews, QR decode, shell-safe curl, upload cancel, clear race, credentials and no-storage fallback.`,
    );
  } finally {
    if (server) await server.stop();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
