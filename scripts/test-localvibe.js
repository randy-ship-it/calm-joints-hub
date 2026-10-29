// Local Consumer Vibe checks. Uses made-up places, so it runs without the private list.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const core = require('../localvibe/localvibe.js');
const { nearest, allow, _reset } = require('../lib/localvibe-lookup.js');

// postal code handling
assert.deepStrictEqual(core.normalizePostal('m5v 2t6').fsa, 'M5V');
assert.strictEqual(core.normalizePostal('D5V'), null);
assert.strictEqual(core.normalizePostal('hello'), null);

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
console.log('localvibe ok');
