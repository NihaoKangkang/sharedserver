// Regressions from independent UI skill reviews, using a disposable share.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const { spawn } = require("node:child_process");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const folder = await fs.mkdtemp(
    path.join(os.tmpdir(), "sharedserver-ui-audit-"),
  );
  await fs.mkdir(path.join(folder, "Alpha"));
  await fs.writeFile(path.join(folder, "Alpha", "child.txt"), "child");
  await fs.writeFile(path.join(folder, "hello.txt"), "Hello");
  for (let i = 0; i < 30; i++)
    await fs.mkdir(path.join(folder, `Middle-${String(i).padStart(2, "0")}`));
  await fs.mkdir(path.join(folder, "ZLong"));
  for (let i = 0; i < 50; i++)
    await fs.writeFile(
      path.join(folder, "ZLong", `entry-${String(i).padStart(2, "0")}.txt`),
      "long folder",
    );
  const listener = net.createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const url = `http://127.0.0.1:${port}/`;
  const server = spawn(process.env.SHARED_PYTHON || "python", [
    "-m",
    "sharedserver",
    String(port),
    "-b",
    "127.0.0.1",
    "-d",
    folder,
    "--no-qr",
  ]);
  let log = "",
    browser;
  server.stdout.on("data", (chunk) => (log += chunk));
  server.stderr.on("data", (chunk) => (log += chunk));
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw new Error(log);
      try {
        ready = (await fetch(url)).ok;
      } catch (_) {}
      if (ready) break;
      await pause(100);
    }
    assert.ok(ready, log);
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    await page.getByLabel("Download hello.txt", { exact: true }).waitFor();
    await page.waitForFunction(
      () => !document.querySelector("#shared-text").disabled,
    );

    // Retry must use the failed target, keeping the old snapshot until success.
    let fail = true;
    const requests = [];
    await page.route("**/api/files?*", async (route) => {
      const target = new URL(route.request().url()).searchParams.get("path");
      requests.push(target);
      if (fail && target === "Alpha") {
        fail = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"detail":"Temporary failure"}',
        });
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Alpha", exact: true }).click();
    await page.locator("#retry-files").waitFor();
    assert.ok(
      await page.getByLabel("Download hello.txt", { exact: true }).isVisible(),
    );
    await page.locator("#retry-files").click();
    await page.getByLabel("Download child.txt", { exact: true }).waitFor();
    assert.deepEqual(requests, ["Alpha", "Alpha"]);
    await page.unroute("**/api/files?*");
    await page
      .getByRole("button", { name: "Shared folder", exact: true })
      .click();
    await page.getByLabel("Download hello.txt", { exact: true }).waitFor();

    // Replacing directory contents keeps a visible, contextual keyboard focus.
    await page.getByRole("button", { name: "Alpha", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByLabel("Download child.txt", { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "files-title",
    );
    assert.match(await page.locator("#folder-context").innerText(), /Alpha/);
    const child = page.getByLabel("Download child.txt", { exact: true });
    await child.focus();
    await page.evaluate(() => loadDirectory());
    assert.ok(await child.evaluate((el) => el === document.activeElement));
    await page.locator("#shared-text").focus();
    await page.evaluate(() => loadDirectory());
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "shared-text",
    );
    await page
      .getByRole("button", { name: "Shared folder", exact: true })
      .click();
    await page.getByLabel("Download hello.txt", { exact: true }).waitFor();

    // A successful action returns focus before closing its More menu.
    const more = page.getByLabel("More actions for hello.txt", { exact: true });
    await more.focus();
    await page.keyboard.press("Enter");
    const copy = page.getByRole("button", {
      name: "Copy file text",
      exact: true,
    });
    await copy.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() =>
      document.querySelector("#toast").textContent.includes("copied"),
    );
    assert.ok(await more.evaluate((el) => el === document.activeElement));
    assert.equal(await more.evaluate((el) => el.parentElement.open), false);

    // A pending form rejects repeated submissions, with stable loading feedback.
    let release,
      entered,
      count = 0;
    let intercepted = new Promise((resolve) => (entered = resolve));
    let barrier = new Promise((resolve) => (release = resolve));
    await page.route("**/api/directories", async (route) => {
      count++;
      entered();
      await barrier;
      await route.continue();
    });
    await page.locator("#new-folder").click();
    await page.locator("#folder-name").fill("CreatedOnce");
    await page.locator("#folder-form").evaluate((form) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await intercepted;
    assert.ok(
      await page
        .getByRole("button", { name: "Creating…", exact: true })
        .isDisabled(),
    );
    assert.equal(
      await page.locator("#folder-form").getAttribute("aria-busy"),
      "true",
    );
    release();
    await page.locator("#folder-dialog").waitFor({ state: "hidden" });
    assert.equal(count, 1);
    await page.unroute("**/api/directories");

    // Persistent, associated validation survives toast expiry and preserves value.
    await page.locator("#new-folder").click();
    await page.locator("#folder-name").fill("Alpha");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.locator("#folder-error").waitFor();
    assert.match(
      await page.locator("#folder-error").innerText(),
      /Choose another name/,
    );
    assert.equal(
      await page.locator("#folder-name").getAttribute("aria-invalid"),
      "true",
    );
    assert.equal(
      await page.locator("#folder-name").getAttribute("aria-describedby"),
      "folder-error",
    );
    assert.equal(await page.locator("#folder-name").inputValue(), "Alpha");
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "folder-name",
    );
    await page.locator("#folder-name").fill("Changed");
    assert.ok(await page.locator("#folder-error").isHidden());
    await page.keyboard.press("Escape");

    // Closing/reopening a dialog isolates the new draft from an old response.
    intercepted = new Promise((resolve) => (entered = resolve));
    barrier = new Promise((resolve) => (release = resolve));
    await page.route("**/api/directories", async (route) => {
      entered();
      await barrier;
      await route.continue();
    });
    await page.locator("#new-folder").click();
    await page.locator("#folder-name").fill("OldRequest");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await intercepted;
    await page.keyboard.press("Escape");
    await page.locator("#new-folder").click();
    await page.locator("#folder-name").fill("NewDraft");
    const oldResponse = page.waitForResponse((response) =>
      response.url().endsWith("api/directories"),
    );
    release();
    await oldResponse;
    await page.waitForTimeout(100);
    assert.ok(await page.locator("#folder-dialog").isVisible());
    assert.equal(await page.locator("#folder-name").inputValue(), "NewDraft");
    await page.keyboard.press("Escape");
    await page.unroute("**/api/directories");

    // Each queued upload exposes a filename and stage without noisy live progress.
    let uploadEntered;
    const uploading = new Promise((resolve) => (uploadEntered = resolve));
    barrier = new Promise((resolve) => (release = resolve));
    await page.route("**/api/upload?*", async (route) => {
      uploadEntered();
      await barrier;
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: '{"detail":"Synthetic conflict"}',
      });
    });
    await page.locator("#file-input").setInputFiles([
      { name: "first.txt", mimeType: "text/plain", buffer: Buffer.from("one") },
      {
        name: "second.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("two"),
      },
    ]);
    await uploading;
    const ax = await page.locator("#transfer-queue").ariaSnapshot();
    assert.match(ax, /progressbar "first.txt"/);
    assert.match(ax, /progressbar "second.txt"/);
    for (const item of await page.locator("#upload-list progress").all()) {
      assert.ok(await item.getAttribute("aria-describedby"));
      assert.ok(await item.getAttribute("aria-valuetext"));
    }
    release();
    await page
      .getByRole("button", { name: "Retry second.txt", exact: true })
      .waitFor();
    await page.locator("#clear-transfers").click();
    await page.unroute("**/api/upload?*");

    // Long-to-long navigation must expose the actual focused heading on screen.
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 812 });
      await page.goto(url);
      await page.getByRole("button", { name: "ZLong", exact: true }).waitFor();
      await page.getByRole("button", { name: "ZLong", exact: true }).focus();
      await page.keyboard.press("Enter");
      await page.getByLabel("Download entry-00.txt", { exact: true }).waitFor();
      const heading = await page.locator("#files-title").evaluate((el) => {
        const box = el.getBoundingClientRect();
        const chrome = document
          .querySelector(innerWidth >= 1024 ? ".topbar" : ".workspace-tabs")
          .getBoundingClientRect();
        return {
          focused: el === document.activeElement,
          visible: box.top >= chrome.height && box.bottom <= innerHeight,
          hit: el.contains(
            document.elementFromPoint(
              box.x + box.width / 2,
              box.y + box.height / 2,
            ),
          ),
        };
      });
      assert.deepEqual(heading, { focused: true, visible: true, hit: true });
      await page
        .getByRole("button", { name: "Shared folder", exact: true })
        .click();
      await page.getByRole("button", { name: "Alpha", exact: true }).waitFor();
      let retryFailure = true;
      await page.route("**/api/files?*", async (route) => {
        if (
          retryFailure &&
          new URL(route.request().url()).searchParams.get("path") === "Alpha"
        ) {
          retryFailure = false;
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: '{"detail":"Retry focus failure"}',
          });
        } else await route.continue();
      });
      await page.getByRole("button", { name: "Alpha", exact: true }).click();
      await page.locator("#retry-files").waitFor();
      await page.locator("#retry-files").focus();
      await page.keyboard.press("Enter");
      await page.getByLabel("Download child.txt", { exact: true }).waitFor();
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "files-title",
      );
      await page.unroute("**/api/files?*");
    }

    // Hover and keyboard focus pause the same toast timer independently.
    await page.locator("#copy-path").click();
    const toast = page.locator("#toast");
    await toast.waitFor();
    await toast.hover();
    await toast.getByRole("button").focus();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(4300);
    assert.ok(
      await toast.isVisible(),
      "Focused toast must survive pointer exit",
    );
    await page.locator("#refresh-files").focus();
    await toast.waitFor({ state: "hidden", timeout: 5000 });
    assert.deepEqual(errors, []);
    console.log(
      "UI audit regressions passed: retry target, focus continuity, duplicate submit, persistent errors, stale response, named progress, toast timer.",
    );
  } finally {
    if (browser) await browser.close();
    server.kill("SIGINT");
    await new Promise((resolve) =>
      server.exitCode !== null ? resolve() : server.once("exit", resolve),
    );
    await fs.rm(folder, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
