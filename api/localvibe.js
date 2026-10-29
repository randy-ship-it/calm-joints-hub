// GET /api/localvibe?pc=M5V
// Returns the postal-area point, an activity estimate input, and up to 3 trusted places within 20 km.
// No route returns the full list. Only the first 3 characters of the postal code are used.
const { clientIp } = require('../lib/intake');
const core = require('../localvibe/localvibe.js');
const { nearest, allow } = require('../lib/localvibe-lookup');

function out(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(JSON.stringify(body));
}
function hostOf(req) { return String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim(); }
function sameSite(req) {
  const origin = req.headers.origin;
  const host = hostOf(req);
  try { if (origin && host) return new URL(origin).host === host; } catch (e) { return false; }
  return true;
}
// Free postal-code lookup (read only): this site's own /localdemand/api/estimate route.
// Set LOCALVIBE_ESTIMATE_URL to point somewhere else (for example straight at the service behind that route).
const ESTIMATE = process.env.LOCALVIBE_ESTIMATE_URL || 'https://calmjoints.org/localdemand/api/estimate';

async function getEstimate(fsa) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 7000);
  try {
    const r = await fetch(ESTIMATE + '?pc=' + encodeURIComponent(fsa), { headers: { Accept: 'application/json' }, signal: ac.signal });
    if (r.status === 404) return { status: 404 };
    if (!r.ok) return { status: 502 };
    return { status: 200, data: await r.json() };
  } catch (e) { return { status: 502 }; } finally { clearTimeout(t); }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return out(res, 405, { error: 'method' }); }
  if (!sameSite(req)) return out(res, 403, { error: 'origin' });
  const q = (req.query && req.query.pc) || new URLSearchParams(String(req.url || '').split('?')[1] || '').get('pc');
  const pc = core.normalizePostal(q);
  if (!pc) return out(res, 400, { error: 'postal' });
  if (!allow(clientIp(req), pc.fsa)) { res.setHeader('Retry-After', '60'); return out(res, 429, { error: 'slow_down' }); }
  const e = await getEstimate(pc.fsa);
  if (e.status !== 200 || !e.data || !e.data.point) return out(res, e.status === 200 ? 404 : e.status, { error: e.status === 502 ? 'lookup' : 'not_found' });
  const d = e.data;
  const views = d.est && d.est['20'] && d.est['20'].views;
  // Area totals per radius (monthly web views and people) from the same estimator as /localdemand. Numbers only, no places.
  const est = {};
  [10, 20].forEach((r) => { const x = d.est && d.est[r]; if (x && isFinite(x.views) && isFinite(x.pop)) est[r] = { views: x.views, pop: x.pop }; });
  out(res, 200, {
    fsa: pc.fsa,
    est,
    point: { lat: d.point.lat, lng: d.point.lon },
    ontario: core.isOntarioFsa(pc.fsa),
    views20: views || 600000,
    places: nearest(d.point.lat, d.point.lon),
  });
};
