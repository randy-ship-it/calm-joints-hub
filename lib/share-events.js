/**
 * "Share your AI recovery concierge" counts (js/share.js -> POST /api/qr-lead kind=share-event).
 * Anonymous: guide, event, method, placement, page and the day. No IP, no cookies, no personal data.
 * Stored as empty private Vercel Blob objects whose pathname is the record:
 *   cj-share/ev/<YYYY-MM-DD>/<guide>.<event>.<placement>.<method>.<ms><rand>.json
 * so the admin summary (GET kind=share-stats, x-cj-admin-key) only lists pathnames.
 */
const GUIDES = new Set(['glen', 'gwen']);
const EVENTS = new Set(['click', 'done', 'copy', 'sms', 'email', 'visit', 'text_guide']);
const PREFIX = 'cj-share/ev/';
function clean(v, n) { return String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n || 24) || 'na'; }

function validateShareEvent(body) {
  if (!body || typeof body !== 'object') return null;
  const guide = clean(body.guide, 8), event = clean(body.event, 12);
  if (!GUIDES.has(guide) || !EVENTS.has(event)) return null;
  return { guide, event, method: clean(body.method, 16), placement: clean(body.placement, 16), page: clean(String(body.page || '').replace(/^\//, '') || 'home', 24) };
}
function eventPath(ev, now = new Date(), rand = Math.random().toString(36).slice(2, 8)) {
  const day = now.toISOString().slice(0, 10);
  return `${PREFIX}${day}/${ev.guide}.${ev.event}.${ev.placement}.${ev.method}.${now.getTime()}${rand}.json`;
}
async function recordShareEvent(body, env, ctx = {}) {
  const ev = validateShareEvent(body);
  if (!ev) return { status: 400, json: { ok: false } };
  console.log('[share]', JSON.stringify(ev));
  if (!env.BLOB_READ_WRITE_TOKEN && !ctx.put) return { status: 200, json: { ok: true, stored: false } };
  try {
    const put = ctx.put || require('@vercel/blob').put;
    await put(eventPath(ev, ctx.now || new Date()), '{}', { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, token: env.BLOB_READ_WRITE_TOKEN });
    return { status: 200, json: { ok: true, stored: true } };
  } catch (err) {
    console.error('[share] store failed', err && err.message);
    return { status: 200, json: { ok: true, stored: false } };
  }
}
function parsePath(p) {
  const m = String(p).slice(PREFIX.length).match(/^(\d{4}-\d{2}-\d{2})\/([a-z]+)\.([a-z_]+)\.([a-z0-9_-]+)\.([a-z0-9_-]+)\.\d+/);
  return m ? { day: m[1], guide: m[2], event: m[3], placement: m[4], method: m[5] } : null;
}
function summarize(paths) {
  const out = { total: 0, byGuide: {}, byDay: {}, byPlacement: {} };
  for (const p of paths) {
    const r = parsePath(p); if (!r) continue;
    out.total++;
    const g = (out.byGuide[r.guide] = out.byGuide[r.guide] || {}); g[r.event] = (g[r.event] || 0) + 1;
    const d = (out.byDay[r.day] = out.byDay[r.day] || {}); const dg = (d[r.guide] = d[r.guide] || {}); dg[r.event] = (dg[r.event] || 0) + 1;
    const pl = (out.byPlacement[r.placement] = out.byPlacement[r.placement] || {}); const pg = (pl[r.guide] = pl[r.guide] || {}); pg[r.event] = (pg[r.event] || 0) + 1;
  }
  return out;
}
async function shareStats(env, ctx = {}) {
  const list = ctx.list || require('@vercel/blob').list;
  const paths = []; let cursor;
  for (let i = 0; i < 20; i++) {
    const r = await list({ prefix: PREFIX, cursor, limit: 1000, token: env.BLOB_READ_WRITE_TOKEN });
    for (const b of r.blobs || []) paths.push(b.pathname);
    if (!r.hasMore || !r.cursor) break; cursor = r.cursor;
  }
  return { ok: true, ...summarize(paths) };
}
module.exports = { validateShareEvent, eventPath, recordShareEvent, parsePath, summarize, shareStats, PREFIX };
