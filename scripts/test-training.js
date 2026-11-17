'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const T = require('../js/training.js');

const pages = {
  hub: fs.readFileSync('training/index.html', 'utf8'),
  book: fs.readFileSync('training/book.html', 'utf8'),
  store: fs.readFileSync('training/store.html', 'utf8'),
};
const css = fs.readFileSync('css/training.css', 'utf8');
const ui = fs.readFileSync('js/training-ui.js', 'utf8');
const logic = fs.readFileSync('js/training.js', 'utf8');
const robots = fs.readFileSync('robots.txt', 'utf8');
const vercel = fs.readFileSync('vercel.json', 'utf8');
const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

const FORBIDDEN = [
  'janeapp.com',
  'fridayapp.org',
  'fridayapp.org/t.js',
  '/js/book.js',
  'gtag(',
  '/api/qr-lead',
  '/api/track',
  'buy.stripe.com',
  'js.stripe.com',
  'scalehealth.ca/calmjoints',
];

for (const [name, html] of Object.entries(pages)) {
  assert.ok(html.includes('noindex'), name + ' missing noindex');
  assert.ok(/TRAINING/i.test(html), name + ' missing TRAINING banner');
  assert.ok(html.includes('does not count toward'), name + ' missing commission warning');
  for (const bad of FORBIDDEN) {
    assert.ok(!html.toLowerCase().includes(bad.toLowerCase()), name + ' contains ' + bad);
  }
}

assert.ok(pages.book.includes('No credit card is required') || pages.book.includes('No credit card is collected'));
assert.ok(pages.store.includes('4242 4242 4242 4242'));
assert.ok(pages.store.includes('The card number never leaves this page'));

for (const src of [css, ui, logic]) {
  for (const bad of FORBIDDEN) {
    assert.ok(!src.toLowerCase().includes(bad.toLowerCase()), 'asset contains ' + bad);
  }
}
assert.ok(!/\bfetch\s*\(/.test(logic + ui), 'training scripts must not fetch');
assert.ok(!/XMLHttpRequest/.test(logic + ui), 'training scripts must not use XHR');
assert.ok(!/sendBeacon/.test(logic + ui), 'training scripts must not beacon');
assert.ok(!/new Stripe\b/.test(logic + ui), 'training scripts must not construct Stripe');

assert.ok(robots.includes('Disallow: /training'));
assert.ok(vercel.includes('"source": "/training"'));
assert.ok(vercel.includes('"source": "/training/(.*)"'));
assert.ok(vercel.includes('noindex, nofollow'));
assert.ok(!sitemap.includes('/training'));
assert.ok(pkg.includes('scripts/test-training.js'));

const initial = T.findById(T.SERVICES, 'initial');
const gabby = T.findById(T.CLINICIANS, 'gabby');
assert.ok(initial && gabby);
assert.ok(fs.existsSync('media/team/gabriela-r.webp'));
assert.ok(fs.existsSync('media/team/aleksandra-n.webp'));
for (const product of T.PRODUCTS) {
  assert.ok(fs.existsSync(product.image.replace(/^\//, '')), 'missing image ' + product.image);
}

const days = T.upcomingDays('2026-11-16', 8);
assert.deepStrictEqual(days[0], '2026-11-16'); // Monday
assert.ok(!days.includes('2026-11-21')); // Saturday
assert.ok(!days.includes('2026-11-22')); // Sunday
assert.strictEqual(days.length, 8);

const slotsA = T.slotsFor('gabby', '2026-11-17');
const slotsB = T.slotsFor('gabby', '2026-11-17');
assert.deepStrictEqual(slotsA, slotsB, 'slots must be deterministic');
assert.ok(T.slotsFor('mark', '2026-11-17').length, 'mark should have some times');

assert.ok(T.isTrainingCard('4242 4242 4242 4242'));
assert.ok(T.isTrainingCard('4242424242424242'));
assert.ok(!T.isTrainingCard('4000000000000002'));
assert.strictEqual(T.formatCard('4242424242424242'), '4242 4242 4242 4242');
assert.ok(T.expiryIsFuture(12, 2026, new Date('2026-11-16T12:00:00-05:00')));
assert.ok(!T.expiryIsFuture(10, 2026, new Date('2026-11-16T12:00:00-05:00')));
assert.ok(T.cvcOk('123'));
assert.ok(!T.cvcOk('12'));

const paid = T.payTrainingOrder({ card: '4242 4242 4242 4242', month: 12, year: 2027, cvc: '123' });
assert.ok(paid.ok, paid.error);
assert.ok(paid.id.startsWith('TRAIN-ORDER-'));
assert.strictEqual(paid.charged, false);
assert.strictEqual(paid.processor, 'none');

const declined = T.payTrainingOrder({ card: '4111111111111111', month: 12, year: 2027, cvc: '123' });
assert.ok(!declined.ok);
assert.ok(/4242/.test(declined.error));
assert.ok(/Nothing was charged/.test(declined.error));

const booked = T.bookTrainingVisit({
  serviceId: 'initial',
  clinicianId: slotsA.length ? 'gabby' : 'mark',
  ymd: '2026-11-17',
  hour: (slotsA[0] || T.slotsFor('mark', '2026-11-17')[0]).hour,
  firstName: 'Mona',
  lastName: 'Training',
  email: 'mona@example.com',
  phone: '4372398581',
});
assert.ok(booked.ok, booked.error);
assert.ok(booked.id.startsWith('TRAIN-VISIT-'));
assert.strictEqual(booked.booked, false);
assert.ok(/No appointment was created/.test(booked.note));

const missing = T.bookTrainingVisit({ serviceId: 'initial' });
assert.ok(!missing.ok);

const totals = T.cartTotals([{ id: 'roll-r3', qty: 2 }, { id: 'kalaya-6x-cream', qty: 1 }]);
assert.strictEqual(totals.usd, 70);
assert.strictEqual(totals.cad, 16.95);

console.log('test-training: ok');
