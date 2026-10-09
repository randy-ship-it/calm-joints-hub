/**
 * QR / print scan counts (js/scan.js and js/book.js -> POST /api/qr-lead kind=scan-event via sendBeacon).
 * Fires once per page load that carries ?src=..., on /chat, /partners and before the /?intent=book
 * hand-off to Jane, plus follow-ups in the same tab session: chat-start (first chat or voice start
 * in the guide) and book-click (booking button or booking tool in the guide).
 * Anonymous: timestamp, page, src and the browser user agent. No IP, no cookies, no personal data.
 * Logged as "[scan] {...}" (Vercel runtime logs) and stored as private Vercel Blob objects:
 *   cj-scan/ev/<YYYY-MM-DD>/<page>.<src>.<ms><rand>.json   body {ts, page, src, ua}
 * Test hits (body.test === true) go to cj-scan/test/... and never count.
 * Admin summary: GET /api/qr-lead?kind=scan-stats with x-cj-admin-key (add &src=<prefix> for the
 * raw event list of one campaign, e.g. src=fieldtest1). Campaign roll-ups: CAMPAIGNS below.
 */
const PAGES = new Set(['book', 'chat', 'partners', 'chat-start', 'book-click']);
const PREFIX = 'cj-scan/ev/';
const TEST_PREFIX = 'cj-scan/test/';
// Named print campaigns: src values (lower-cased) that roll up into one campaign count.
const CAMPAIGNS = { FieldTest1: /^fieldtest1(-|$)/ };
function clean(v, n) { return String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n || 24) || ''; }

function validateScanEvent(body) {
  if (!body || typeof body !== 'object') return null;
  const page = clean(body.page, 12), src = clean(body.src, 40);
  if (!PAGES.has(page) || !src) return null;
  const ev = { page, src: src.replace(/\./g, '-') };
  if (body.test === true) ev.test = true;
  return ev;
}
function cleanUa(v) { return String(v || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 240); }
function eventPath(ev, now = new Date(), rand = Math.random().toString(36).slice(2, 8)) {
  return `${ev.test ? TEST_PREFIX : PREFIX}${now.toISOString().slice(0, 10)}/${ev.page}.${ev.src}.${now.getTime()}${rand}.json`;
}
async function recordScanEvent(body, env, ctx = {}) {
  const ev = validateScanEvent(body);
  if (!ev) return { status: 400, json: { ok: false } };
  const now = ctx.now || new Date();
  const rec = { ts: now.toISOString(), page: ev.page, src: ev.src, ua: cleanUa(ctx.ua) };
  if (ev.test) rec.test = true;
  console.log('[scan]', JSON.stringify(rec));
  if (!env.BLOB_READ_WRITE_TOKEN && !ctx.put) return { status: 200, json: { ok: true, stored: false } };
  try {
    const put = ctx.put || require('@vercel/blob').put;
    await put(eventPath(ev, now), JSON.stringify(rec), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, token: env.BLOB_READ_WRITE_TOKEN });
    return { status: 200, json: { ok: true, stored: true } };
  } catch (err) {
    console.error('[scan] store failed', err && err.message);
    return { status: 200, json: { ok: true, stored: false } };
  }
}
function parsePath(p) {
  const m = String(p).slice(PREFIX.length).match(/^(\d{4}-\d{2}-\d{2})\/([a-z-]+)\.([a-z0-9_-]+)\.(\d{13})/);
  return m ? { day: m[1], page: m[2], src: m[3], ts: new Date(Number(m[4])).toISOString() } : null;
}
function summarize(paths) {
  const out = { total: 0, bySrc: {}, byDay: {}, campaigns: {} };
  for (const p of paths) {
    const r = parsePath(p); if (!r) continue;
    out.total++;
    for (const [name, re] of Object.entries(CAMPAIGNS)) {
      if (!re.test(r.src)) continue;
      const c = (out.campaigns[name] = out.campaigns[name] || { total: 0, byPage: {}, bySrc: {} });
      c.total++; c.byPage[r.page] = (c.byPage[r.page] || 0) + 1; c.bySrc[r.src] = (c.bySrc[r.src] || 0) + 1;
    }
    const s = (out.bySrc[r.src] = out.bySrc[r.src] || {}); s[r.page] = (s[r.page] || 0) + 1;
    const d = (out.byDay[r.day] = out.byDay[r.day] || {}); const ds = (d[r.src] = d[r.src] || {}); ds[r.page] = (ds[r.page] || 0) + 1;
  }
  return out;
}
async function scanStats(env, ctx = {}) {
  const list = ctx.list || require('@vercel/blob').list;
  const paths = []; let cursor;
  for (let i = 0; i < 20; i++) {
    const r = await list({ prefix: PREFIX, cursor, limit: 1000, token: env.BLOB_READ_WRITE_TOKEN });
    for (const b of r.blobs || []) paths.push(b.pathname);
    if (!r.hasMore || !r.cursor) break; cursor = r.cursor;
  }
  const out = { ok: true, ...summarize(paths) };
  const want = clean(ctx.src, 40);
  if (want) out.events = paths.map(parsePath).filter((r) => r && r.src.startsWith(want)).slice(-500);
  return out;
}
module.exports = { validateScanEvent, eventPath, recordScanEvent, parsePath, summarize, scanStats, PREFIX, TEST_PREFIX, CAMPAIGNS };
