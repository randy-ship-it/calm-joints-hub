// Smoke test for /localdemand. Uses the dev server (static page + estimate proxy)
// unless LOCALDEMAND_BASE is a deployed origin such as a Vercel preview.
//
// Requires playwright (`npm install --no-save playwright`). Uses CHROME_PATH or
// Playwright's Chromium. Saves screenshots when SHOTS_DIR is set.
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.env.SHOTS_DIR || '';
if (shots) fs.mkdirSync(shots, { recursive: true });

const CASES = [
  { id: 'M5V2T6', pc: 'M5V 2T6', views: ['46K', '140K', '411K', '997K', '2.26M'] },
  { id: 'L4K3N5', pc: 'L4K 3N5', views: ['4K', '12K', '171K', '798K', '2.78M'] },
  { id: 'H2X1Y4', pc: 'H2X 1Y4', views: ['26K', '92K', '419K', '1.27M', '2.25M'] },
];
// Upstream fmt() is toFixed(2), so 2,262,000 views render as 2.26M (the README's 2.262M).
const RADII = ['1', '2', '5', '10', '20'];
const FORBIDDEN = [
  /fall50/i, /royalt/i, /\bboost\b/i, /monetize/i, /clinichubs/i, /request login/i,
  /scalehealth/i, /local ad value/i, /birchreserve/i, /ambassador/i, /\bhubs?\b/i,
  /clairvoyant/i, /80 locations/i, /\bAlign\b/, /50%\s*royalty|earn 50%|>50%/i, /\$\d/,
  /launch my/i, /api\/lead/i, /api\/snapshot/i,
];

function fail(msg) {
  console.error(msg);
  process.exitCode = 1;
  throw new Error(msg);
}

async function launchBrowser() {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    fail('playwright is not installed. Run: npm install --no-save playwright');
  }
  const opts = { headless: true };
  if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
  return playwright.chromium.launch(opts);
}

function startDevServer(port) {
  const child = spawn(process.execPath, ['scripts/dev-server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (b) => { log += b; });
  child.stderr.on('data', (b) => { log += b; });
  return {
    child,
    ready: new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('dev server did not start\n' + log)), 10000);
      child.stdout.on('data', () => {
        if (log.includes('Calm Joints dev')) { clearTimeout(t); resolve(); }
      });
      child.on('exit', (code) => { clearTimeout(t); reject(new Error('dev server exited ' + code + '\n' + log)); });
    }),
    stop() { child.kill('SIGTERM'); },
  };
}

async function readTiles(page) {
  return page.evaluate(() => ({
    big: document.querySelector('#vb').textContent,
    label: document.querySelector('#lbl').textContent,
    sub: document.querySelector('#sub').textContent,
    tiles: ['1', '2', '5', '10', '20'].map((r) => document.querySelector('#v' + r).textContent),
    href: document.querySelector('#cjgo').href,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    badge: document.querySelector('.cj-badge') && document.querySelector('.cj-badge').textContent,
    html: document.documentElement.outerHTML,
  }));
}

async function shot(page, name) {
  if (!shots) return;
  await page.screenshot({ path: path.join(shots, name + '.png'), fullPage: true });
}

async function main() {
  const external = process.env.LOCALDEMAND_BASE || '';
  const port = Number(process.env.PORT || 4187);
  const browser = await launchBrowser();
  const server = external ? null : startDevServer(port);
  if (server) await server.ready;
  const base = external || `http://127.0.0.1:${port}`;
  try {
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const page = await desktop.newPage();
    const phone = await mobile.newPage();

    const home = await desktop.newPage();
    await home.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await home.locator('a.ld-link[href="/localdemand"]').waitFor();
    const partners = await desktop.newPage();
    await partners.goto(base + '/partners?source=localdemand&pc=M5V%202T6&radius=20#inquire', { waitUntil: 'domcontentloaded' });
    const prefill = await partners.locator('#p-msg').inputValue();
    if (!prefill.includes('M5V 2T6') || !prefill.includes('20 km')) fail('partner form did not prefill the lookup: ' + prefill);
    if (await partners.locator('#p-type').inputValue() !== 'health') fail('partner form did not select health services');
    if (!(await partners.locator('a[href="/localdemand"]').count())) fail('partnerships page is missing the local demand link');

    for (const c of CASES) {
      for (const [p, prefix] of [[page, 'desk'], [phone, 'phone']]) {
        await p.goto(base + '/localdemand', { waitUntil: 'domcontentloaded' });
        await p.locator('#pc').fill(c.pc);
        await p.locator('#rad').selectOption('20');
        await p.locator('#pcf button').click();
        await p.waitForFunction(() => /people around/.test(document.querySelector('#sub').textContent), null, { timeout: 45000 });
        await p.waitForTimeout(800);
        const got = await readTiles(p);
        if (got.tiles.join(',') !== c.views.join(',')) fail(`${c.id} ${prefix} tiles ${got.tiles.join(',')} wanted ${c.views.join(',')}`);
        if (got.big !== c.views[4]) fail(`${c.id} ${prefix} headline ${got.big}`);
        if (!got.sub.includes('people around')) fail(`${c.id} ${prefix} missing people count: ${got.sub}`);
        if (/\$/.test(got.sub)) fail(`${c.id} ${prefix} dollar figure in subline: ${got.sub}`);
        if (got.badge !== 'Calm Joints: fulfillment partner for Scale Health, for recovery') fail('badge missing');
        const href = new URL(got.href);
        if (href.pathname !== '/partners' || href.searchParams.get('source') !== 'localdemand') fail('partner link ' + got.href);
        if (href.searchParams.get('pc') !== c.pc || href.searchParams.get('radius') !== '20') fail('partner link params ' + got.href);
        if (got.overflow > 1) fail(`${c.id} ${prefix} horizontal overflow ${got.overflow}px`);
        for (const re of FORBIDDEN) {
          if (re.test(got.html)) fail(`${c.id} forbidden ${re} in page HTML`);
        }
        await shot(p, `${prefix}-${c.id}`);
        await p.locator('#s5').click();
        await p.waitForFunction(() => document.querySelector('#lbl').textContent.includes('5 km'), null, { timeout: 5000 });
        const mid = await readTiles(p);
        if (mid.big !== c.views[2] || mid.label !== 'Monthly web views within 5 km') fail(`${c.id} ${prefix} radius tile did not switch`);
        if (new URL(mid.href).searchParams.get('radius') !== '5') fail(`${c.id} ${prefix} radius not passed to the partner link`);
      }
    }

    await page.goto(base + '/localdemand', { waitUntil: 'domcontentloaded' });
    await page.locator('#pc').fill('M5V');
    await page.locator('#pcf').press('Enter');
    await page.waitForFunction(() => /people around/.test(document.querySelector('#sub').textContent), null, { timeout: 45000 });
    const fsa = await readTiles(page);
    if (fsa.tiles.join(',') !== CASES[0].views.join(',')) fail('FSA M5V tiles ' + fsa.tiles.join(','));
    await shot(page, 'desk-M5V');

    await page.goto(base + '/localdemand', { waitUntil: 'domcontentloaded' });
    await page.locator('#pc').fill('');
    await page.locator('#pcf').press('Enter');
    await page.waitForFunction(() => /Enter a Canadian postal code/.test(document.querySelector('#sub').textContent));
    await page.locator('#pc').fill('NOT A CODE');
    await page.locator('#pc').press('Enter');
    await page.waitForFunction(() => /not found/i.test(document.querySelector('#sub').textContent), null, { timeout: 20000 });
    const bad = await readTiles(page);
    if (bad.big !== '\u2014') fail('invalid code changed the headline: ' + bad.big);
    if (!/not found/i.test(bad.sub)) fail('invalid code message: ' + bad.sub);
    await shot(page, 'desk-invalid');

    const body = await page.locator('h1').textContent();
    if (body !== 'Local recovery demand') fail('page crashed or lost its heading');
    console.log('localdemand browser: three postal codes, FSA, invalid code, keyboard submit, partner prefill');
  } finally {
    await browser.close();
    if (server) server.stop();
  }
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
