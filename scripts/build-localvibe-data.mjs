// Builds the PRIVATE location file for the Local Consumer Vibe lookup. The repo is public, so this file is never committed.
//   node scripts/build-localvibe-data.mjs <trusted-locations.csv> [geocache.json] [--b64]
// Writes .private/localvibe-locations.json (git-ignored, not deployed). For production, put the same JSON, base64 encoded,
// in the LOCALVIBE_LOCATIONS_B64 environment variable (--b64 prints it).
// Drops rows marked "on the way out", rows with no coordinates, and the exclude list.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const csvPath = args[0] || process.env.LOCALVIBE_CSV;
if (!csvPath) { console.error('Usage: node scripts/build-localvibe-data.mjs <csv> [geocache.json] [--b64]'); process.exit(1); }

function parseCsv(t) {
  const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { r.push(f); f = ''; }
    else if (c === '\n') { r.push(f); rows.push(r); r = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || r.length) { r.push(f); rows.push(r); }
  const h = rows.shift();
  return rows.filter((x) => x.length > 1).map((x) => Object.fromEntries(h.map((k, i) => [k, x[i] || ''])));
}
// Per-place overrides live in .private/overrides.json (git-ignored): { rename: {from: to}, noLink: [names] }
const OVR = (() => { try { return JSON.parse(fs.readFileSync(new URL('../.private/overrides.json', import.meta.url), 'utf8')); } catch (e) { return {}; } })();
const RENAME = OVR.rename || {};
// These sites did not load on the link check, so they show a name only until fixed.
const EXCLUDE = (OVR.exclude || []).map((x) => new RegExp(x, 'i'));
const NO_LINK_NAMES = OVR.noLink || [];
const NO_LINK = [/netlify\.app/i];
function typeOf(n, w) {
  const s = (n + ' ' + w).toLowerCase();
  if (/chiro|spine/.test(s)) return 'Chiropractic';
  if (/pilates|barre/.test(s)) return 'Pilates';
  if (/stretch/.test(s)) return 'Stretch studio';
  if (/yoga/.test(s)) return 'Yoga';
  if (/physio/.test(s)) return 'Physiotherapy';
  if (/crossfit|athletic|performance|training|fitness|fit\b|strength|gym/.test(s)) return 'Gym and training';
  return 'Wellness studio';
}
function site(name, f) {
  if (NO_LINK_NAMES.includes(name)) return '';
  const m = /HYPERLINK\("([^"]+)"/.exec(f || '');
  const u = m ? m[1] : (/^https?:/.test(f || '') ? f : '');
  if (!u || NO_LINK.some((r) => r.test(u))) return '';
  return u.replace(/^http:\/\//, 'https://');
}
const city = (a) => { const p = a.split(',').map((x) => x.trim()); return p.length >= 3 ? p[p.length - 2] : ''; };

let cache = {};
if (args[1]) cache = JSON.parse(fs.readFileSync(args[1], 'utf8'));
const out = []; const skipped = [];
for (const r of parseCsv(fs.readFileSync(csvPath, 'utf8'))) {
  if (/on way out/i.test(r.status)) { skipped.push([r.name, 'on the way out']); continue; }
  if (EXCLUDE.some((x) => x.test(r.name))) { skipped.push([r.name, 'excluded']); continue; }
  if (!r.lat || !r.lon) { skipped.push([r.name, 'no coordinates yet']); continue; }
  let lat = +r.lat, lng = +r.lon, approx = /FSA/.test(r.coord_src);
  const g = cache[r.name];
  if (approx && g && g.ok) { lat = g.lat; lng = g.lon; approx = false; }
  const name = RENAME[r.name] || r.name;
  out.push({
    name, type: typeOf(name, r.website), city: city(r.address),
    lat: +lat.toFixed(5), lng: +lng.toFixed(5), approx, website: site(r.name, r.website),
    status: /just launched/i.test(r.status) ? 'new' : 'trusted',
  });
}
const json = JSON.stringify(out);
if (/align|integrity|clairvoyant|@/i.test(json)) { console.error('Banned term in output'); process.exit(1); }
fs.mkdirSync(path.join(root, '.private'), { recursive: true });
fs.writeFileSync(path.join(root, '.private/localvibe-locations.json'), json + '\n');
console.log(`locations: ${out.length} (${out.filter((o) => o.approx).length} approximate pins, ${out.filter((o) => !o.website).length} without a website)`);
console.log('skipped:', skipped.map((s) => s.join(': ')).join('; '));
if (process.argv.includes('--b64')) console.log('\nLOCALVIBE_LOCATIONS_B64=' + Buffer.from(json).toString('base64'));
