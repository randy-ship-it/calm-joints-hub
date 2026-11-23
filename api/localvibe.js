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
// Free postal-code lookup (read only): the service behind /localdemand/api/estimate. Called directly, not via
// calmjoints.org, because a server-side call to our own public domain can hit Vercel's bot challenge (429) -> lookup error.
// Set LOCALVIBE_ESTIMATE_URL to point somewhere else (for example straight at the service behind that route).
const ESTIMATE = process.env.LOCALVIBE_ESTIMATE_URL || 'https://scale-partner-dash.vercel.app/localdemand/api/estimate';

async function getEstimate(fsa, pt) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 7000);
  try {
    const qs = pt ? 'lat=' + pt.lat + '&lon=' + pt.lng : 'pc=' + encodeURIComponent(fsa);
    const r = await fetch(ESTIMATE + '?' + qs, { headers: { Accept: 'application/json' }, signal: ac.signal });
    if (r.status === 404) return { status: 404 };
    if (!r.ok) return { status: 502 };
    return { status: 200, data: await r.json() };
  } catch (e) { return { status: 502 }; } finally { clearTimeout(t); }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return out(res, 405, { error: 'method' }); }
  if (!sameSite(req)) return out(res, 403, { error: 'origin' });
  const q = (req.query && req.query.pc) || new URLSearchParams(String(req.url || '').split('?')[1] || '').get('pc');
  const gq = (req.query && req.query.q) || new URLSearchParams(String(req.url || '').split('?')[1] || '').get('q');
  const glat = parseFloat((req.query && req.query.lat) || new URLSearchParams(String(req.url || '').split('?')[1] || '').get('lat'));
  const glng = parseFloat((req.query && req.query.lng) || new URLSearchParams(String(req.url || '').split('?')[1] || '').get('lng'));
  // Place-name suggestions (Canada only), so people can type a city instead of a postal code.
  if (gq && !q) {
    const text = String(gq).trim().slice(0, 60);
    if (text.length < 2) return out(res, 200, { places: [] });
    if (!allow(clientIp(req), 'q:' + text.toLowerCase().slice(0, 3))) { res.setHeader('Retry-After', '60'); return out(res, 429, { error: 'slow_down' }); }
    return suggest(text, res);
  }
  // "Use my location": coordinates are rounded to about 1 km, used for this lookup only, and not stored.
  if (!q && isFinite(glat) && isFinite(glng)) {
    if (glat < 41.6 || glat > 84 || glng < -141 || glng > -52) return out(res, 404, { error: 'not_found' });
    const pt = { lat: Math.round(glat * 100) / 100, lng: Math.round(glng * 100) / 100 };
    if (!allow(clientIp(req), 'g:' + pt.lat.toFixed(1) + ',' + pt.lng.toFixed(1))) { res.setHeader('Retry-After', '60'); return out(res, 429, { error: 'slow_down' }); }
    const g = await getEstimate(null, pt);
    if (g.status !== 200 || !g.data || !g.data.point) return out(res, g.status === 200 ? 404 : g.status, { error: g.status === 502 ? 'lookup' : 'not_found' });
    return reply(res, g.data, String(req.query && req.query.label || '').replace(/[^\w .,'’-]/g, '').slice(0, 40) || 'you', null);
  }
  const pc = core.normalizePostal(q);
  if (!pc) return out(res, 400, { error: 'postal' });
  if (!allow(clientIp(req), pc.fsa)) { res.setHeader('Retry-After', '60'); return out(res, 429, { error: 'slow_down' }); }
  const e = await getEstimate(pc.fsa);
  if (e.status !== 200 || !e.data || !e.data.point) return out(res, e.status === 200 ? 404 : e.status, { error: e.status === 502 ? 'lookup' : 'not_found' });
  return reply(res, e.data, pc.fsa, core.isOntarioFsa(pc.fsa));
};

async function suggest(text, res) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 5000);
  try {
    const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&countryCode=CA&name=' + encodeURIComponent(text), { signal: ac.signal });
    const j = r.ok ? await r.json() : {};
    const seen = new Set();
    const places = (j.results || []).filter((x) => isFinite(x.latitude) && isFinite(x.longitude)).map((x) => ({
      label: x.name + (x.admin1 ? ', ' + x.admin1 : ''), name: x.name, lat: Math.round(x.latitude * 100) / 100, lng: Math.round(x.longitude * 100) / 100,
    })).filter((x) => !seen.has(x.label) && seen.add(x.label)).slice(0, 5);
    res.setHeader('Cache-Control', 'public, max-age=3600'); res.setHeader('X-Robots-Tag', 'noindex');
    return out(res, 200, { places });
  } catch (e) { return out(res, 200, { places: [] }); } finally { clearTimeout(t); }
}

function reply(res, d, label, ontarioFlag) {
  const views = d.est && d.est['20'] && d.est['20'].views;
  // Area totals per radius (monthly web views and people) from the same estimator as /localdemand. Numbers only, no places.
  const est = {};
  [10, 20].forEach((r) => { const x = d.est && d.est[r]; if (x && isFinite(x.views) && isFinite(x.pop)) est[r] = { views: x.views, pop: x.pop }; });
  out(res, 200, {
    fsa: label,
    est,
    point: { lat: d.point.lat, lng: d.point.lon },
    ontario: ontarioFlag === null ? true : ontarioFlag,
    views20: views || 600000,
    places: nearest(d.point.lat, d.point.lon),
  });
}
