// Offline checks for the /localdemand URL. It serves the combined Local Consumer Vibe page
// (localvibe/index.html) through a rewrite. There must be NO static localdemand/index.html:
// Vercel serves static files before rewrites and routes, so a leftover file hides the new page.
// The estimate proxy stays at /localdemand/api/estimate.
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.ok(!fs.existsSync(path.join(root, 'localdemand/index.html')), 'localdemand/index.html must not exist (it would shadow the rewrite)');
assert.ok(!fs.existsSync(path.join(root, 'scripts/sync-localdemand.mjs')) && !fs.existsSync(path.join(root, '.github/workflows/sync-localdemand.yml')), 'old localdemand sync must stay removed');

const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const partners = fs.readFileSync(path.join(root, 'partners.html'), 'utf8');
assert.ok(home.includes('href="/localdemand"') && home.includes('Check local demand near you'));
assert.ok(partners.includes('href="/localdemand"') && partners.includes('Check local demand near you'));
assert.ok(partners.includes("q.get('source') !== 'localdemand'"));
assert.ok(partners.includes("type.value = 'health'"));

const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const rewrite = vercel.rewrites.find((r) => r.source === '/localdemand/api/estimate');
assert.ok(rewrite, 'missing estimate rewrite');
assert.strictEqual(rewrite.destination, 'https://scale-partner-dash.vercel.app/localdemand/api/estimate');
assert.ok(!JSON.stringify(vercel).includes('scale-partner-dash.vercel.app/localdemand/api/lead'));
assert.ok(!JSON.stringify(vercel).includes('api/snapshot'));
for (const src of ['/localdemand', '/localdemand/']) {
  const r = vercel.rewrites.find((x) => x.source === src);
  assert.ok(r && r.destination === '/localvibe', src + ' must rewrite to /localvibe');
}
assert.ok(vercel.rewrites.findIndex((x) => x.source === '/localdemand/api/estimate') >= 0);

const alias = fs.readFileSync(path.join(root, 'lib/partner-alias.js'), 'utf8');
const mid = fs.readFileSync(path.join(root, 'middleware.js'), 'utf8');
assert.ok(alias.includes("'localdemand'"));
assert.ok(mid.includes('localdemand$'));

const dev = fs.readFileSync(path.join(root, 'scripts/dev-server.js'), 'utf8');
assert.ok(dev.includes("pathname === '/localdemand/api/estimate'"));
assert.ok(dev.includes('scale-partner-dash.vercel.app/localdemand/api/estimate'));

console.log('localdemand: links, rewrite and no-static-copy checks passed (no static copy, rewrite to /localvibe)');
