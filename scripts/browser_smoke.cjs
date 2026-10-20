// Optional end-to-end check and real-browser demo capture.
// Install Playwright and Chromium separately, then run with the project venv active:
// SHARED_PYTHON=.venv/bin/python node scripts/browser_smoke.cjs
const {chromium} = require('playwright');
const {spawn} = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sharedserver-smoke-'));
  const server = spawn(process.env.SHARED_PYTHON || 'python', [
    '-m', 'sharedserver', '18765', '--host', process.env.LAN_SMOKE === '1' ? '0.0.0.0' : '127.0.0.1', '-d', directory, '--token', '--no-qr'
  ]);
  let browser;
  try {
    let startupOutput = '';
    const url = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 10000);
      server.stdout.on('data', data => {
        output += data;
        startupOutput = output;
        const match = output.match(/http:\/\/127\.0\.0\.1:18765\/\?token=[\w-]+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      server.on('error', reject);
      server.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    });
    await fs.writeFile(path.join(directory, 'Welcome.txt'), 'Your files stay on your local network.\n');
    browser = await chromium.launch({headless: true});
    const desktop = await browser.newContext({permissions: ['clipboard-read', 'clipboard-write'], viewport: {width: 950, height: 820}, colorScheme: 'light'});
    const phone = await browser.newContext({permissions: ['clipboard-read', 'clipboard-write'], viewport: {width: 390, height: 820}, isMobile: true, hasTouch: true, colorScheme: 'light'});
    const a = await desktop.newPage();
    const b = await phone.newPage();
    const errors = [];
    for (const page of [a, b]) page.on('pageerror', error => errors.push(error.message));
    await a.goto(url, {waitUntil: 'networkidle'});
    const phoneUrl = process.env.LAN_SMOKE === '1' ? startupOutput.match(/LAN:\s+(http:\/\/[^\s]+)/)[1] : url;
    await b.goto(phoneUrl, {waitUntil: 'networkidle'});
    await a.waitForFunction(() => !document.querySelector('#shared-text').disabled);
    await b.waitForFunction(() => !document.querySelector('#shared-text').disabled);
    assert.equal(a.url(), 'http://127.0.0.1:18765/');
    assert.equal(b.url(), new URL('/', phoneUrl).href);
    if (process.env.LAN_SMOKE === '1') assert.equal(await b.evaluate(() => window.isSecureContext), false);
    const frames = path.resolve('build/demo-frames');
    await fs.mkdir(frames, {recursive: true});
    let step = 0;
    async function capture(caption) {
      if (process.env.CAPTURE_DEMO !== '1') return;
      const name = String(step++).padStart(2, '0');
      await a.screenshot({path: path.join(frames, `${name}-desktop.png`)});
      await b.screenshot({path: path.join(frames, `${name}-phone.png`)});
      await fs.writeFile(path.join(frames, `${name}.txt`), caption);
    }
    await capture('1. Open the same private link on two devices. No login.');
    await a.locator('#shared-text').fill('Meet at the cafe at 10:30.\nSent from the computer.');
    await b.waitForFunction(() => document.querySelector('#shared-text').value.includes('Sent from the computer.'));
    await capture('2. Paste on the computer. Text appears on the phone.');
    await b.locator('#copy-shared').click();
    await b.getByText('Text copied', {exact: true}).waitFor();
    assert.equal(await a.evaluate(() => navigator.clipboard.readText()),
                 'Meet at the cafe at 10:30.\nSent from the computer.');
    await capture('3. Tap Copy text on the receiving device.');
    await b.locator('#shared-text').fill('Got it!\nSent back from the phone.');
    await a.waitForFunction(() => document.querySelector('#shared-text').value.includes('Sent back from the phone.'));
    await capture('4. Text sync works in both directions.');
    const png = await b.screenshot();
    await b.locator('#file-input').setInputFiles({name: 'Phone-snapshot.png', mimeType: 'image/png', buffer: png});
    await b.getByText('Phone-snapshot.png', {exact: true}).waitFor();
    await a.locator('#refresh-files').click();
    await a.getByText('Phone-snapshot.png', {exact: true}).waitFor();
    assert.deepEqual(await fs.readFile(path.join(directory, 'Phone-snapshot.png')), png);
    const downloadReady = a.waitForEvent('download');
    await a.getByRole('link', {name: 'Download Phone-snapshot.png', exact: true}).click();
    const download = await downloadReady;
    assert.deepEqual(await fs.readFile(await download.path()), png);
    await b.locator('#file-list').scrollIntoViewIfNeeded();
    await capture('5. Upload an image from the phone. Download it on the computer.');
    await a.locator('#new-folder').click();
    await a.locator('#folder-name').fill('New folder');
    await a.locator('#folder-form button[type="submit"]').click();
    await a.getByRole('button', {name: 'New folder', exact: true}).last().waitFor();
    await desktop.setOffline(true);
    await a.evaluate(() => socket.close()); // Chromium keeps existing WebSockets when toggling offline.
    await a.waitForFunction(() => document.querySelector('#connection').textContent.includes('Connection lost'));
    await a.locator('#shared-text').fill('Preserved while offline');
    await desktop.setOffline(false);
    await a.waitForFunction(() => !document.querySelector('#send-draft').hidden && !document.querySelector('#send-draft').disabled);
    assert.equal(await a.locator('#shared-text').inputValue(), 'Preserved while offline');
    await a.locator('#send-draft').click();
    await b.waitForFunction(() => document.querySelector('#shared-text').value === 'Preserved while offline');
    await b.reload({waitUntil: 'networkidle'});
    await b.waitForFunction(() => document.querySelector('#shared-text').value === 'Preserved while offline');
    assert.equal(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log('Browser smoke passed: private session, bidirectional text, copy, image upload, folder creation, offline draft, reload, mobile width.');
  } finally {
    if (browser) await browser.close();
    server.kill('SIGINT');
    await new Promise(resolve => server.exitCode !== null ? resolve() : server.once('exit', resolve));
    await fs.rm(directory, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
