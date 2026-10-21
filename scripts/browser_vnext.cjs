// End-to-end vNext regression checks. Requires Playwright and Chromium.
const { chromium } = require("playwright");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const assert = require("node:assert/strict");
const python = process.env.SHARED_PYTHON || "python";

async function showWorkspace(page, name) {
  const tab = page.locator(`#tab-${name}`);
  if (await tab.isVisible()) await tab.click();
}

async function freePort() {
  const listener = net.createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}
async function start(args) {
  const folder = await fs.mkdtemp(
    path.join(os.tmpdir(), "sharedserver-vnext-"),
  );
  await fs.writeFile(
    path.join(folder, "existing.txt"),
    "private existing content",
  );
  const port = await freePort();
  const server = spawn(python, [
    "-m",
    "sharedserver",
    String(port),
    "-b",
    process.env.LAN_SMOKE === "1" ? "0.0.0.0" : "127.0.0.1",
    "-d",
    folder,
    "--no-qr",
    ...args,
  ]);
  let output = "";
  server.stdout.on("data", (data) => {
    output += data;
  });
  server.stderr.on("data", (data) => {
    output += data;
  });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(output);
    if (output.includes("Ctrl+C")) {
      try {
        await new Promise((resolve, reject) => {
          const connection = net.connect(port, "127.0.0.1", () => {
            connection.destroy();
            resolve();
          });
          connection.on("error", reject);
        });
        const local = output.match(/Local:\s+(http:\/\/\S+)/)[1];
        const lan = output.match(/LAN:\s+(http:\/\/\S+)/)?.[1] || local;
        return {
          folder,
          local,
          lan,
          stop: async () => {
            server.kill("SIGINT");
            await new Promise((resolve) =>
              server.exitCode !== null
                ? resolve()
                : server.once("exit", resolve),
            );
            await fs.rm(folder, { recursive: true, force: true });
          },
        };
      } catch (_) {
        /* The CLI prints its URL before Uvicorn binds the socket. */
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  server.kill("SIGINT");
  throw new Error(`Server did not start: ${output}`);
}
async function ready(page, url) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => !document.querySelector("#shared-text")?.disabled,
  );
}
async function paste(page, payload) {
  await page.evaluate((data) => {
    const transfer = new DataTransfer();
    if (data.text) transfer.setData("text/plain", data.text);
    if (data.bytes)
      transfer.items.add(
        new File([new Uint8Array(data.bytes)], data.name, { type: data.type }),
      );
    document.body.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, payload);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  let server;
  try {
    server = await start([
      "--random-url",
      "--pin",
      "123456",
      "--auth",
      "owner:secret",
    ]);
    const context = await browser.newContext({
      httpCredentials: { username: "owner", password: "secret" },
      viewport: { width: 1000, height: 900 },
    });
    const mobile = await browser.newContext({
      httpCredentials: { username: "owner", password: "secret" },
      viewport: { width: 390, height: 850 },
      isMobile: true,
      hasTouch: true,
    });
    const a = await context.newPage();
    const b = await mobile.newPage();
    const errors = [];
    a.on("console", (message) => {
      if (message.type() === "error")
        console.error("Browser console:", message.text());
    });
    a.on("response", async (response) => {
      if (response.url().includes("/api/zip"))
        console.log(
          "ZIP HTTP",
          response.status(),
          response.status() === 200
            ? response.headers()["content-type"]
            : await response.text(),
        );
    });
    for (const page of [a, b])
      page.on("pageerror", (error) => errors.push(error.message));
    await ready(a, server.local);
    await ready(b, process.env.LAN_SMOKE === "1" ? server.lan : server.local);
    const base = a.url();
    assert.match(base, /\/s\/[\w-]+\/$/);
    assert.equal(new URL(base).search, "");
    await paste(a, { text: "Pasted outside the editor" });
    await b.waitForFunction(
      () =>
        document.querySelector("#shared-text").value ===
        "Pasted outside the editor",
    );
    const image = await a.screenshot();
    await paste(a, { bytes: [...image], name: "image.png", type: "image/png" });
    await showWorkspace(b, "clipboard");
    await b.locator("#shared-image").waitFor({ state: "visible" });
    await b.waitForFunction(
      () => document.querySelector("#shared-image-preview").naturalWidth > 0,
    );
    await showWorkspace(b, "files");
    await b.locator("#refresh-files").click();
    await b.getByLabel(/^More actions for paste_.*\.png$/).click();
    await b.getByRole("button", { name: "Copy image", exact: true }).waitFor();
    if (process.env.LAN_SMOKE === "1") {
      assert.equal(await b.evaluate(() => window.isSecureContext), false);
      await b.getByRole("button", { name: "Copy image", exact: true }).click();
      await b.locator("#image-dialog").waitFor({ state: "visible" });
      await b.locator("#close-image").click();
    }
    await paste(a, {
      bytes: [104, 101, 108, 108, 111],
      name: "pasted.txt",
      type: "text/plain",
    });
    await showWorkspace(a, "files");
    await a
      .getByRole("checkbox", { name: "Select pasted.txt", exact: true })
      .waitFor();
    await a.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File(["whole-page drop"], "dropped.txt", { type: "text/plain" }),
      );
      document
        .querySelector(".topbar")
        .dispatchEvent(
          new DragEvent("drop", {
            dataTransfer: transfer,
            bubbles: true,
            cancelable: true,
          }),
        );
    });
    // Await the completed listing, not an in-progress upload label.
    await a
      .getByRole("checkbox", { name: "Select dropped.txt", exact: true })
      .waitFor();
    assert.equal(
      await fs.readFile(path.join(server.folder, "dropped.txt"), "utf8"),
      "whole-page drop",
    );
    await a
      .getByRole("checkbox", { name: "Select dropped.txt", exact: true })
      .check();
    await a
      .getByRole("checkbox", { name: "Select pasted.txt", exact: true })
      .check();
    const downloadReady = a.waitForEvent("download");
    await a.locator("#download-zip").click();
    const download = await downloadReady;
    const check = spawnSync(
      python,
      [
        "-c",
        'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert set(z.namelist()) == {"dropped.txt","pasted.txt"}; assert z.read("pasted.txt") == b"hello"',
        await download.path(),
      ],
      { encoding: "utf8" },
    );
    assert.equal(check.status, 0, check.stderr);
    assert.equal(
      (await context.request.get(new URL("/api/files", base).href)).status(),
      404,
    );
    assert.deepEqual(errors, []);
    await context.close();
    await mobile.close();
    await server.stop();
    server = null;

    server = await start(["--mode", "readonly"]);
    const readonly = await browser.newContext();
    const r = await readonly.newPage();
    await ready(r, server.local);
    assert.equal(
      await r.locator("#shared-text").evaluate((node) => node.readOnly),
      true,
    );
    assert.equal(await r.locator("#choose-files").isVisible(), false);
    assert.equal(
      (
        await readonly.request.post(
          new URL("api/clipboard/raw", r.url()).href,
          { data: "blocked" },
        )
      ).status(),
      403,
    );
    await readonly.close();
    await server.stop();
    server = null;

    server = await start(["--mode", "droponly"]);
    const drop = await browser.newContext();
    await drop.routeWebSocket("**/ws", (route) => {
      const upstream = route.connectToServer();
      upstream.onMessage((message) => {
        const delayed = JSON.parse(message.toString()).type === "ack";
        if (delayed) setTimeout(() => route.send(message), 350);
        else route.send(message);
      });
    });
    const d = await drop.newPage();
    const observer = await drop.newPage();
    await ready(d, server.local);
    await ready(observer, server.local);
    assert.equal(await d.locator("#file-table").isVisible(), false);
    await paste(d, { text: "unsubmitted global paste" });
    await d.evaluate(() => socket.close());
    await d.waitForFunction(() =>
      document
        .querySelector("#connection")
        .textContent.includes("Connection lost"),
    );
    await d.waitForFunction(
      () =>
        !document.querySelector("#send-draft").hidden &&
        !document.querySelector("#send-draft").disabled,
    );
    assert.equal(
      await d.locator("#shared-text").inputValue(),
      "unsubmitted global paste",
    );
    await paste(d, { text: "first submission" });
    await d.locator("#submit-text").click();
    await d.locator("#shared-text").fill("second draft");
    await d
      .getByText("Previous text submitted. Your new draft was preserved.", {
        exact: true,
      })
      .waitFor();
    assert.equal(await d.locator("#shared-text").inputValue(), "second draft");
    await d.locator("#submit-text").click();
    await d.waitForFunction(
      () => document.querySelector("#shared-text").value === "",
    );
    const textNames = (await fs.readdir(server.folder)).filter((name) =>
      name.startsWith("text_"),
    );
    const savedTexts = await Promise.all(
      textNames.map((name) =>
        fs.readFile(path.join(server.folder, name), "utf8"),
      ),
    );
    assert.deepEqual(savedTexts.sort(), ["first submission", "second draft"]);
    assert.equal(await observer.locator("#shared-text").inputValue(), "");
    assert.equal(
      (await drop.request.get(new URL("api/files", d.url()).href)).status(),
      403,
    );
    assert.equal(
      (
        await drop.request.get(new URL("api/clipboard/raw", d.url()).href)
      ).status(),
      403,
    );
    await showWorkspace(d, "files");
    await d
      .locator("#file-input")
      .setInputFiles({
        name: "inbox.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("inbox"),
      });
    await d.getByText("Uploaded inbox.txt", { exact: true }).waitFor();
    assert.equal(
      await fs.readFile(path.join(server.folder, "inbox.txt"), "utf8"),
      "inbox",
    );
    await drop.close();
    console.log(
      "vNext browser checks passed: prefix/PIN/Basic sessions, global text/image/file paste, image sync/preview, whole-page drop, native ZIP download, readonly, private inbox, delayed acknowledgements and reconnecting unsent drafts.",
    );
  } finally {
    if (server) await server.stop();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
