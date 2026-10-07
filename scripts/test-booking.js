const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const JANE = 'https://calmjoints.janeapp.com/locations/calm-joints/book#/list';
const OLD = 'scalehealth.janeapp.com/locations/scale-health-x-dr-ho/book';

const window = {};
vm.runInNewContext(fs.readFileSync('config.js', 'utf8'), { window });
assert.strictEqual(window.CALM_JOINTS.booking.primaryUrl, JANE);
assert.strictEqual(window.CALM_JOINTS.booking.status, 'partner-clinic');

const pages = [
  'index.html',
  'partners.html',
  'p.html',
  'blog/index.html',
  'blog/knee-pain-going-down-stairs.html',
  'blog/is-walking-good-for-knee-arthritis.html',
  'blog/does-virtual-physiotherapy-work.html',
  'blog/is-walking-good-for-hip-arthritis.html',
];

for (const page of pages) {
  const html = fs.readFileSync(page, 'utf8');
  assert.ok(!html.includes(OLD), page + ' still points at the DR-HO Jane clinic');
  assert.ok(!html.includes('book-dlg'), page + ' still has the partner booking popup');
  assert.ok(!html.includes('OK, book with DR-HO'), page + ' still has the DR-HO booking confirm');
}

const home = fs.readFileSync('index.html', 'utf8');
assert.equal((home.match(/data-book/g) || []).length, 3, 'nav, hero, and sticky Book controls');
assert.ok(home.includes('src="/js/book.js?v=2"'));
assert.ok(home.includes('src="/config.js"'));

for (const page of ['partners.html', 'blog/index.html', 'blog/knee-pain-going-down-stairs.html', 'blog/is-walking-good-for-knee-arthritis.html', 'blog/does-virtual-physiotherapy-work.html', 'blog/is-walking-good-for-hip-arthritis.html']) {
  const html = fs.readFileSync(page, 'utf8');
  assert.ok(html.includes('data-book'), page + ' Book control is not wired');
  assert.ok(html.includes('src="/config.js"'), page);
  assert.ok(html.includes('src="/js/book.js?v=2"'), page);
}

const handoff = fs.readFileSync('p.html', 'utf8');
assert.ok(handoff.includes('booking.primaryUrl'));
assert.ok(!handoff.includes('#book'), 'partner handoff still routes through the homepage booking popup');

const bookJs = fs.readFileSync('js/book.js', 'utf8');
assert.ok(bookJs.includes('booking.primaryUrl'));
assert.ok(bookJs.includes('CJGuide'), 'Book opens the guide pop-up');
assert.ok(!bookJs.includes(OLD));

const posts = [];
const links = [
  { href: '#', attrs: { 'data-book': '' } },
  { href: '/#book', attrs: {} },
].map((spec) => {
  const el = {
    href: spec.href,
    target: '',
    rel: '',
    matches(sel) {
      if (sel === '[data-book]') return Object.prototype.hasOwnProperty.call(spec.attrs, 'data-book');
      return false;
    },
    addEventListener(type, fn) { el.listeners[type] = fn; },
    listeners: {},
  };
  return el;
});
let replaced = null;
let opened = 0;
const head = { appendChild: (n) => { if (n.tag === 'script') loadedScript = n; } };
let loadedScript = null;
const makeEl = (tag) => ({ tag, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, addEventListener(t, fn) { this['on' + t] = fn; } });
const sandbox = {
  window: window,
  URLSearchParams,
  document: { querySelectorAll: () => links, querySelector: () => null, createElement: makeEl, head },
  location: { hash: '', search: '', replace: (next) => { replaced = next; } },
  localStorage: { getItem: () => JSON.stringify({ slug: 'maple-tennis-club', email: 'pat@example.com', c: 'abc123', at: Date.now() }) },
  fetch: (url, init) => { posts.push({ url, body: JSON.parse(init.body) }); return Promise.resolve(); },
};
sandbox.window = window;
vm.runInNewContext(bookJs, sandbox);
assert.ok(loadedScript && /\/js\/guide\.js/.test(loadedScript.src), 'guide script is loaded');
window.CJGuide = { open() { opened += 1; } };
for (const el of links) {
  assert.strictEqual(el.href, JANE, 'fallback href stays the booking page');
  assert.strictEqual(el.target, '_blank');
  assert.strictEqual(el.rel, 'noopener noreferrer');
  let prevented = false;
  el.listeners.click({ preventDefault() { prevented = true; } });
  assert.strictEqual(prevented, true, 'Book click opens the guide pop-up');
}
assert.strictEqual(opened, 2);
assert.strictEqual(replaced, null, 'a normal page load must stay on the site');
assert.strictEqual(posts.length, 0, 'opening the pop-up is not a booking');

sandbox.location.hash = '#book';
vm.runInNewContext(bookJs, sandbox);
assert.strictEqual(replaced, JANE, '/#book must leave for the booking page');
assert.strictEqual(posts.length, 1);
assert.strictEqual(posts[0].body.event, 'book');
assert.strictEqual(posts[0].body.slug, 'maple-tennis-club');

replaced = null;
sandbox.location.hash = '';
sandbox.location.search = '?intent=book&area=knee&province=ON&src=qr&venue=beach-volleyball';
vm.runInNewContext(bookJs, sandbox);
assert.strictEqual(replaced, JANE, '/?intent=book must leave for the booking page');
assert.strictEqual(posts.length, 2);

console.log('booking url tests ok');
