#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/team-data.js', 'utf8'), ctx);
const team = ctx.window.CJ_TEAM;
assert.strictEqual(team.length, 3);
const names = team.map((p) => (p.first || '') + (p.last ? ' ' + p.last.charAt(0) + '.' : ''));
assert.strictEqual(names.join('|'), 'Gabriela R.|Aleksandra N.|Mark R.');
assert.strictEqual(team.map((p) => p.photo).join('|'), [
  '/media/team/gabriela-r.webp',
  '/media/team/aleksandra-n.webp',
  '/media/team/mark-r.webp',
].join('|'));
for (const p of team) {
  assert.ok(!/\.svg$/.test(p.photo), p.photo);
  const file = p.photo.replace(/^\//, '');
  const buf = fs.readFileSync(file);
  assert.strictEqual(buf.slice(0, 4).toString(), 'RIFF', file);
  assert.strictEqual(buf.slice(8, 12).toString(), 'WEBP', file);
}
assert.ok(!fs.existsSync('media/team/gabriela-r.svg'));
assert.ok(!fs.existsSync('media/team/aleksandra-n.svg'));

const html = fs.readFileSync('team.html', 'utf8');
assert.ok(html.includes('js/team-data.js'));
assert.ok(html.includes("p.last.charAt(0)"));
assert.ok(html.includes('scroll-snap-type: x mandatory'));
assert.ok(html.includes('id="rail"'));
assert.ok(!/gabriela-r\.svg|aleksandra-n\.svg/.test(html));
assert.ok(html.includes('href="/report"'));
assert.ok(fs.readFileSync('sitemap.xml', 'utf8').includes('https://calmjoints.org/team'));
assert.ok(fs.readFileSync('index.html', 'utf8').includes('href="/team"'));
console.log('team: all checks passed');
