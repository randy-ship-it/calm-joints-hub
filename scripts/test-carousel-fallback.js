#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fallback = require('../js/img-fallback');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const demo = fs.readFileSync(path.join(root, 'body-map-demo.html'), 'utf8');
const squash = fs.readFileSync(path.join(root, 'squash.html'), 'utf8');

assert.ok(index.includes('Trusted by the brands we power'));
assert.ok(index.includes('src="/media/hubs/effortless-v5.webp"'));
assert.ok(!/src="\/media\/hubs\/effortless-v4\.webp"/.test(index));
assert.ok(index.includes('data-fallback-src="/media/logos/effortless-admin.png"'));
assert.ok(index.includes('/js/img-fallback.js?v=1'));
assert.ok(index.includes('Effortless Admin member portal with featured member-priced products'));
assert.ok(demo.includes('src="/media/hubs/effortless-v5.webp"'));
assert.ok(!/src="\/media\/hubs\/effortless-v4\.webp"/.test(demo));

const webp = fs.readFileSync(path.join(root, 'media/hubs/effortless-v5.webp'));
assert.strictEqual(webp.slice(0, 4).toString(), 'RIFF');
assert.strictEqual(webp.slice(8, 12).toString(), 'WEBP');
assert.ok(webp.length > 10000, 'portal screenshot should be a real image');
assert.ok(fs.existsSync(path.join(root, 'media/logos/effortless-admin.png')));
assert.ok(fs.existsSync(path.join(root, 'media/hubs/effortless-v5.source.txt')));

// Cropped portal card must not be a tiny logo-only plate, and the HTML
// should still describe it as a member portal.
assert.ok(index.includes('member portal'));

assert.ok(index.includes('.frame img.is-fallback'));
assert.ok(index.includes('.frame img.is-missing'));

assert.ok(squash.includes('/js/img-fallback.js?v=1'));
assert.ok(fs.readFileSync(path.join(root, 'css/sport-zone.css'), 'utf8').includes('.th-card img.is-missing'));

function fakeImg(attrs) {
  const img = {
    tagName: 'IMG',
    classList: { items: [], add: function (c) { if (this.items.indexOf(c) < 0) this.items.push(c); } },
    _attrs: Object.assign({}, attrs),
    getAttribute: function (k) { return this._attrs[k] == null ? null : this._attrs[k]; },
    setAttribute: function (k, v) { this._attrs[k] = v; },
    addEventListener: function () {},
    complete: false,
    naturalWidth: 0,
  };
  Object.defineProperty(img, 'src', {
    get: function () { return this._attrs.src; },
    set: function (v) { this._attrs.src = v; },
  });
  return img;
}

const withLogo = fakeImg({ src: '/missing.webp', 'data-fallback-src': '/media/logos/effortless-admin.png' });
fallback.apply(withLogo);
assert.strictEqual(withLogo.src, '/media/logos/effortless-admin.png');
assert.ok(withLogo.classList.items.includes('is-fallback'));
assert.strictEqual(withLogo.getAttribute('data-fallback-done'), '1');

const already = fakeImg({
  src: '/media/logos/effortless-admin.png',
  'data-fallback-src': '/media/logos/effortless-admin.png',
  'data-fallback-done': '1',
});
already.src = '/media/logos/effortless-admin.png';
fallback.apply(already);
assert.strictEqual(already.src, '/media/logos/effortless-admin.png');

const noLogo = fakeImg({ src: '/gone.webp' });
fallback.apply(noLogo);
assert.ok(noLogo.classList.items.includes('is-missing'));
assert.ok((noLogo.src || '').indexOf('data:image/gif') === 0);

const bound = fakeImg({ src: '/ok.webp', 'data-fallback-src': '/logo.png' });
let errors = 0;
bound.addEventListener = function (type, fn) { if (type === 'error') errors += 1; bound._onError = fn; };
fallback.bind(bound);
assert.strictEqual(errors, 1);
assert.strictEqual(bound.getAttribute('data-fallback-bound'), '1');
bound._onError();
assert.strictEqual(bound.src, '/logo.png');

console.log('carousel-fallback: all checks passed');
