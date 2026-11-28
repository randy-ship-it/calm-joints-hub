const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const JANE = 'https://calmjoints.janeapp.com/locations/calm-joints/book#/discipline/2/treatment/346';
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
  'blog/how-long-does-frozen-shoulder-last.html',
];

for (const page of pages) {
  const html = fs.readFileSync(page, 'utf8');
  assert.ok(!html.includes(OLD), page + ' still points at the DR-HO Jane clinic');
  assert.ok(!html.includes('book-dlg'), page + ' still has the partner booking popup');
  assert.ok(!html.includes('OK, book with DR-HO'), page + ' still has the DR-HO booking confirm');
}

const home = fs.readFileSync('index.html', 'utf8');
assert.equal((home.match(/data-book[ >]/g) || []).length, 3, 'nav, hero, and sticky Book controls');
assert.equal((home.match(/data-book data-book-direct/g) || []).length, 3, 'Book now goes straight to booking');
assert.ok((home.match(/data-talk /g) || []).length >= 2, 'Chat remains available');
assert.ok(home.includes('src="/js/book.js?v=8"'));
assert.ok(home.includes('src="/config.js"'));

for (const page of ['partners.html', 'blog/index.html', 'blog/knee-pain-going-down-stairs.html', 'blog/is-walking-good-for-knee-arthritis.html', 'blog/does-virtual-physiotherapy-work.html', 'blog/is-walking-good-for-hip-arthritis.html', 'blog/how-long-does-frozen-shoulder-last.html']) {
  const html = fs.readFileSync(page, 'utf8');
  assert.ok(html.includes('data-book'), page + ' Book control is not wired');
  assert.ok(html.includes('src="/config.js"'), page);
  assert.ok(/src="\/js\/book\.js\?v=\d+"/.test(html), page);
}

const handoff = fs.readFileSync('p.html', 'utf8');
assert.ok(handoff.includes('booking.primaryUrl'));
assert.ok(!handoff.includes('#book'), 'partner handoff still routes through the homepage booking popup');

const bookJs = fs.readFileSync('js/book.js', 'utf8');
assert.ok(bookJs.includes('booking.primaryUrl'));
assert.ok(bookJs.includes("/book"), 'Book goes to the in-site calendar');
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
    removeAttribute(k) { if (k === 'target') el.target = ''; if (k === 'rel') el.rel = ''; },
    listeners: {},
  };
  return el;
});
let replaced = null;
const head = { appendChild: () => {} };
const makeEl = (tag) => ({ tag, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, addEventListener() {} });
const sandbox = {
  window: window,
  URLSearchParams,
  document: { querySelectorAll: () => links, querySelector: () => null, createElement: makeEl, head, body: { hasAttribute: () => false } },
  location: { hash: '', search: '', replace: (next) => { replaced = next; } },
  localStorage: { getItem: () => JSON.stringify({ slug: 'maple-tennis-club', email: 'pat@example.com', c: 'abc123', at: Date.now() }) },
  fetch: (url, init) => { posts.push({ url, body: JSON.parse(init.body) }); return Promise.resolve(); },
};
sandbox.window = window;
vm.runInNewContext(bookJs, sandbox);
for (const el of links) {
  assert.strictEqual(el.href, '/book', 'Book controls point at the in-site calendar');
}
assert.strictEqual(replaced, null, 'a normal page load must stay on the site');
assert.strictEqual(posts.length, 0, 'pointing at /book is not a completed booking');

sandbox.location.hash = '#book';
vm.runInNewContext(bookJs, sandbox);
assert.ok(String(replaced).startsWith('/book'), '/#book must go to the in-site calendar');
assert.strictEqual(posts.length, 1);
assert.strictEqual(posts[0].body.event, 'book');
assert.strictEqual(posts[0].body.slug, 'maple-tennis-club');

replaced = null;
sandbox.location.hash = '';
sandbox.location.search = '?intent=book&area=knee&province=ON&src=qr&venue=beach-volleyball';
vm.runInNewContext(bookJs, sandbox);
assert.ok(String(replaced).startsWith('/book'), '/?intent=book must go to the in-site calendar');
assert.ok(replaced.includes('area=knee'));
assert.ok(replaced.includes('src=qr'));
assert.strictEqual(posts.length, 2);

console.log('booking url tests ok');
