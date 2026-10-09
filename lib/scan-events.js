/**
 * QR / print scan counts (js/scan.js and js/book.js -> POST /api/qr-lead kind=scan-event via sendBeacon).
 * Fires once per page load that carries ?src=..., on /chat, /partners and before the /?intent=book
 * hand-off to Jane. Anonymous: page, src and the day. No IP, no cookies, no personal data.
 * Logged as "[scan] {...}" (Vercel runtime logs) and stored as empty private Vercel Blob objects:
 *   cj-scan/ev/<YYYY-MM-DD>/<page>.<src>.<ms><rand>.json
 * Admin summary: GET /api/qr-lead?kind=scan-stats with x-cj-admin-key.
 */
const PAGES = new Set(['book', 'chat', 'partners']);
const PREFIX = 'cj-scan/ev/';
function clean(v, n) { return String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n || 24) || ''; }

function validateScanEvent(body) {
  if (!body || typeof body !== 'object') return null;
  const page = clean(body.page, 12), src = clean(body.src, 40);
  if (!PAGES.has(page) || !src) return null;
  return { page, src: src.replace(/\./g, '-') };
}
function eventPath(ev, now = new Date(), rand = Math.random().toString(36).slice(2, 8)) {
  return `${PREFIX}${now.toISOString().slice(0, 10)}/${ev.page}.${ev.src}.${now.getTime()}${rand}.json`;
}
async function recordScanEvent(body, env, ctx = {}) {
  const ev = validateScanEvent(body);
  if (!ev) return { status: 400, json: { ok: false } };
  console.log('[scan]', JSON.stringify(ev));
  if (!env.BLOB_READ_WRITE_TOKEN && !ctx.put) return { status: 200, json: { ok: true, stored: false } };
  try {
    const put = ctx.put || require('@vercel/blob').put;
    await put(eventPath(ev, ctx.now || new Date()), '{}', { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, token: env.BLOB_READ_WRITE_TOKEN });
    return { status: 200, json: { ok: true, stored: true } };
  } catch (err) {
    console.error('[scan] store failed', err && err.message);
    return { status: 200, json: { ok: true, stored: false } };
  }
}
function parsePath(p) {
  const m = String(p).slice(PREFIX.length).match(/^(\d{4}-\d{2}-\d{2})\/([a-z]+)\.([a-z0-9_-]+)\.\d+/);
  return m ? { day: m[1], page: m[2], src: m[3] } : null;
}
function summarize(paths) {
  const out = { total: 0, bySrc: {}, byDay: {} };
  for (const p of paths) {
    const r = parsePath(p); if (!r) continue;
    out.total++;
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
  return { ok: true, ...summarize(paths) };
}
module.exports = { validateScanEvent, eventPath, recordScanEvent, parsePath, summarize, scanStats, PREFIX };
