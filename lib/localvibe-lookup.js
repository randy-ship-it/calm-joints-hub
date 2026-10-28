// Local Consumer Vibe: server-side lookup. The trusted-places list stays on the server.
// Source in production: environment variable LOCALVIBE_LOCATIONS_B64 (encoded JSON).
// For local work: .private/localvibe-locations.json (git-ignored, not deployed).
const fs = require('fs');
const path = require('path');
const core = require('../localvibe/localvibe.js');

const MAX_RESULTS = 3;
const MAX_KM = 20;
let cached = null;

function loadLocations() {
  if (cached) return cached;
  let raw = '';
  const env = process.env.LOCALVIBE_LOCATIONS_B64;
  if (env) raw = Buffer.from(env, 'base64').toString('utf8');
  else {
    try { raw = fs.readFileSync(path.join(__dirname, '..', '.private', 'localvibe-locations.json'), 'utf8'); } catch (e) { raw = '[]'; }
  }
  try { cached = JSON.parse(raw).filter((l) => isFinite(l.lat) && isFinite(l.lng) && l.name); } catch (e) { cached = []; }
  return cached;
}

// Nearest trusted places for a point: at most 3, within 20 km. Nothing else is returned.
function nearest(lat, lng, locs) {
  return core.within(locs || loadLocations(), lat, lng, MAX_KM).slice(0, MAX_RESULTS).map((l, i) => ({
    n: i + 1, name: l.name, type: l.type, city: l.city, lat: l.lat, lng: l.lng, approx: !!l.approx,
    website: l.website || '', status: l.status, km: Math.round(l.km * 10) / 10,
  }));
}

// Per-visitor limits, in memory (best effort per serverless instance): a burst limit and a daily cap on distinct postal areas.
const burst = new Map();
const daily = new Map();
function allow(ip, fsa, now) {
  now = now || Date.now();
  const hits = (burst.get(ip) || []).filter((t) => now - t < 60 * 1000);
  if (hits.length >= 12) { burst.set(ip, hits); return false; }
  hits.push(now); burst.set(ip, hits);
  const d = daily.get(ip);
  const rec = d && now - d.at < 24 * 3600 * 1000 ? d : { at: now, set: new Set() };
  rec.set.add(fsa);
  daily.set(ip, rec);
  if (daily.size > 5000) daily.clear();
  return rec.set.size <= 20;
}

module.exports = { loadLocations, nearest, allow, MAX_RESULTS, MAX_KM, _reset() { cached = null; burst.clear(); daily.clear(); } };
