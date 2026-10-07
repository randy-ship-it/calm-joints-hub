// "Calmer joints" tagline + jingle: tap-to-play only, files present, tagline on shared headers.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
for (const f of ['media/jingle-calmer-joints.mp3', 'media/jingle-calmer-joints.m4a']) assert.ok(fs.statSync(path.join(root, f)).size > 10000, f);
const idx = read('index.html');
assert.ok(/<button type="button" class="cj-jingle" data-jingle aria-pressed="false" aria-label="Play jingle: Calm-er joints with Calm Joints">/.test(idx), 'jingle button with aria-label');
assert.ok(!/<audio/i.test(idx) && !/jingle[^\n]*autoplay/i.test(idx), 'no audio tag, jingle never autoplays');
assert.ok(idx.includes('/js/jingle.js'), 'jingle.js loaded');
const js = read('js/jingle.js');
assert.ok(!/\.autoplay/.test(js) && /addEventListener\('click', toggle\)/.test(js), 'plays on tap only');
for (const f of ['index.html', 'partners.html', 'blog/index.html', 'blog/knee-pain-going-down-stairs.html']) assert.ok(read(f).includes('<span class="cj-tagline" aria-hidden="true">Calmer joints</span>'), 'tagline in ' + f);
assert.ok(read('js/guide.js').includes('<small aria-hidden="true">Calmer joints</small>'), 'tagline in /chat header');
console.log('jingle tests ok');
