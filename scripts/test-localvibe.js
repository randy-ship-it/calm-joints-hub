// Local Consumer Vibe checks. Uses made-up places, so it runs without the private list.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const core = require('../localvibe/localvibe.js');
const { nearest, allow, _reset } = require('../lib/localvibe-lookup.js');

// postal code handling: FSA alone, spaced/unspaced full code, any case
assert.deepStrictEqual(core.normalizePostal('M5V'), { fsa: 'M5V', full: 'M5V' });
assert.deepStrictEqual(core.normalizePostal('m5v'), { fsa: 'M5V', full: 'M5V' });
assert.deepStrictEqual(core.normalizePostal('M5V 2T6'), { fsa: 'M5V', full: 'M5V 2T6' });
assert.deepStrictEqual(core.normalizePostal('m5v2t6').fsa, 'M5V');
assert.deepStrictEqual(core.normalizePostal('m5v 2t6').fsa, 'M5V');
assert.strictEqual(core.normalizePostal('M5'), null);
assert.strictEqual(core.normalizePostal('D5V'), null);
assert.strictEqual(core.normalizePostal('hello'), null);
assert.ok(fs.readFileSync(path.join(root, 'localvibe/index.html'), 'utf8').includes('localvibe.js?v=6'));

// nearest: at most 3, within 20 km, closest first
const locs = [];
for (let i = 0; i < 8; i++) locs.push({ name: 'Test Place ' + i, type: 'Pilates', city: 'Toronto', lat: 43.64 + i * 0.01, lng: -79.4, approx: false, website: 'https://example.com/' + i, status: 'trusted' });
locs.push({ name: 'Far Place', type: 'Pilates', city: 'Ottawa', lat: 45.4, lng: -75.7, website: '', status: 'trusted' });
const near = nearest(43.64, -79.4, locs);
assert.strictEqual(near.length, 3);
assert.ok(near[0].km <= near[1].km && near[1].km <= near[2].km);
assert.ok(!near.some((p) => p.name === 'Far Place'));
assert.strictEqual(nearest(49.28, -123.12, locs).length, 0);

// brand estimates: same inputs give the same answer, and the list is stable
const brands = JSON.parse(fs.readFileSync(path.join(root, 'localvibe/brands.json'), 'utf8'));
const a = core.rankBrands(brands, 'M5V').map((r) => r.brand.slug).join();
assert.strictEqual(a, core.rankBrands(brands, 'M5V').map((r) => r.brand.slug).join());
const now = Date.UTC(2026, 9, 28, 15, 0);
assert.strictEqual(core.lastHour('M5V', 'dr-ho', 0.2, 5000, 0.03, now), core.lastHour('M5V', 'dr-ho', 0.2, 5000, 0.03, now));

// rate limit
_reset();
let blocked = 0;
for (let i = 0; i < 30; i++) if (!allow('198.51.100.7', 'M5V', 1000 + i)) blocked++;
assert.ok(blocked > 0, 'burst should be limited');

// banned terms in public files
const bad = /align|integrity fitness|clairvoyant/i;
['localvibe/index.html', 'localvibe/theme.js', 'localvibe/localvibe.js', 'localvibe/brands.json'].forEach((f) => {
  assert.ok(!bad.test(fs.readFileSync(path.join(root, f), 'utf8')), f + ' mentions a banned term');
});
const html = fs.readFileSync(path.join(root, 'localvibe/index.html'), 'utf8');
assert.ok(html.includes('Estimates only, not a guarantee. You may see more or less activity in your area. We are learning how brand audience views convert to bookings in real time, and we update these numbers as the data gets more accurate.'));

// no static copy of the places list
assert.ok(!fs.existsSync(path.join(root, 'localvibe/data')));
const ign = fs.readFileSync(path.join(root, '.gitignore'), 'utf8') + fs.readFileSync(path.join(root, '.vercelignore'), 'utf8');
assert.ok(ign.includes('.private/'));

// routes
const routes = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')).routes;
assert.ok(routes.some((r) => r.src.startsWith('/near-you') && r.dest === '/localvibe/index.html'));
assert.ok(routes.some((r) => r.src.startsWith('/localdemand') && r.dest === '/localvibe/index.html'), '/localdemand serves the combined page');
assert.ok(routes.every((r) => !/localdemand\/api/.test(r.src)));
brands.forEach((b) => assert.ok(brands.every((x) => x.cat), 'brand categories'));
brands.forEach((b) => assert.ok(routes.some((r) => r.src.startsWith('/hub/' + b.slug + '/') && /^https:\/\/www\.scalehealth\.ca\//.test(r.headers.Location)), 'hub redirect for ' + b.slug));
assert.ok(!/8\.7\s*mm/i.test(html), 'no 8.7mm');
// scrubbed media: cache-proof names only, old names must stay gone
['media/partners/cj-booking-v2-loop.mp4', 'media/partners/cj-booking-v2-loop.webm', 'media/partners/cj-booking-v2-poster.webp', 'media/partners/cj-booking-v2.webp', 'media/hubs/effortless-v4.webp'].forEach((f) => assert.ok(fs.existsSync(path.join(root, f)), f + ' exists'));
['media/partners/cj-booking-loop.mp4', 'media/partners/cj-booking-loop.webm', 'media/partners/cj-booking-poster.webp', 'media/partners/cj-booking.webp', 'media/hubs/effortless-v3.webp'].forEach((f) => assert.ok(!fs.existsSync(path.join(root, f)), f + ' (old, cached) must stay deleted'));
['index.html', 'body-map-demo.html'].forEach((f) => assert.ok(!/cj-booking(-loop|-poster)?\.(mp4|webm|webp)|effortless-v3/.test(fs.readFileSync(path.join(root, f), 'utf8')), f + ' references an old media name'));
console.log('localvibe ok');

// Different areas must not tell the same brand story (dense core vs quiet town, different postal codes).
{
  const top = (fsa, pop10) => { const p = core.areaProfile(pop10); return core.rankBrands(brands, fsa, { u: p.u, block: 2 }).slice(0, 4).map((r) => r.brand.slug).join(); };
  const sets = new Set([top('M5V', 1.4e6), top('L6Y', 7e5), top('N0B', 2e4), top('K1A', 5e5), top('V6B', 8e5), top('P0M', 3e3)]);
  assert.ok(sets.size >= 5, 'top brands should differ by area');
  const core1 = core.rankBrands(brands, 'M5V', { u: 1, block: 2 }).map((r) => r.brand.slug).join();
  assert.strictEqual(core1, core.rankBrands(brands, 'M5V', { u: 1, block: 2 }).map((r) => r.brand.slug).join());
}
console.log('localvibe area variation ok');

// Enterprise embed copy stays out of the public defaults
{
  const html = fs.readFileSync(path.join(root, 'localvibe/index.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'localvibe/localvibe.js'), 'utf8');
  const ent = fs.readFileSync(path.join(root, 'enterprise.html'), 'utf8');
  assert.ok(html.includes('monthly web views about recovery care (estimate)'), 'public default stat label');
  assert.ok(html.includes('trusted places close by'), 'public default near label');
  assert.ok(html.includes('id="lv-api-line"'), 'api explainer element');
  assert.ok(js.includes('applyEmbedCopy') && js.includes('digital demand in Scale Health hubs near'), 'embed demand copy');
  assert.ok(ent.includes('Expanding across Canada') && ent.includes('USA planned Q1 2027') && ent.includes("Scale's physio booking network") && ent.includes('Building coverage across Canada'), 'enterprise coverage');
  assert.ok(ent.includes('Fully managed by Scale. Your business shares in the revenue.'), 'managed revenue line');
  assert.ok(ent.includes('See a physio from home.') && ent.includes('Illustrative experience') && !ent.includes('Kinlo'), 'CJ booking experience');
  assert.ok(ent.includes('Only if needed') && ent.includes('Health &amp; wellness apps'), 'optional in-person and dropdown');
  assert.ok(ent.includes('Just the Physio API.') && ent.includes('35% of the net revenue Scale collects on products and services'), 'two commercial options');
  assert.ok(!/35%\s*of\s*(the\s*)?gross/i.test(ent), 'store payout is not gross sales');
  assert.ok(ent.includes('member-hub-full-store.webp') && !/store-shot\{[^}]*height:\s*248/.test(ent), 'store visual is not a short crop');
  assert.ok(!ent.includes('Canada-wide now') && !ent.includes('USA launching Q1 2027') && !/Canada-wide physio/.test(ent), 'no live nationwide inventory claim');
  assert.ok(ent.includes('Any calendar') && ent.includes('One click to physio'), 'enterprise hero');
  assert.ok(ent.includes('/localdemand?embed=1') && ent.includes('id="enterprise-form"') && ent.includes("'/api/partner'"), 'map and partner form stay');
  assert.ok((ent.match(/vetted/gi) || []).length <= 1, 'at most one vetted');
  const body = ent.split(/<body[\s>]/i)[1] || ent;
  assert.ok(!/\bAlign\b/.test(body.replace(/<style[\s\S]*?<\/style>/gi, '')), 'no Align on the enterprise page');
  assert.ok(!/align/i.test(ent.match(/id="network"[\s\S]*?<\/section>/)[0]), 'no Align in coverage');
}
console.log('enterprise embed demand copy ok');
