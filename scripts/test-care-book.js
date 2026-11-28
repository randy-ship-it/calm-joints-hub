const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { listOpenings, bookUrl, _reset } = require('../lib/guide-availability');

const home = fs.readFileSync('index.html', 'utf8');
const book = fs.readFileSync('book.html', 'utf8');
const css = fs.readFileSync('css/care.css', 'utf8');
const bookJs = fs.readFileSync('js/book.js', 'utf8');
const openings = fs.readFileSync('api/openings.js', 'utf8');
const lead = fs.readFileSync('api/booking-lead.js', 'utf8');

for (const [name, txt] of [['index', home], ['book', book], ['css', css], ['book.js', bookJs]]) {
  assert.ok(!/best in class/i.test(txt), name + ' says "best in class"');
  assert.ok(!/most competitive in Ontario/i.test(txt), name + ' makes an unverified competitive claim');
  assert.ok(!/clairvoyant/i.test(txt), name + ' mentions Clairvoyant');
  assert.ok(!/align wellness|clairvoyant holdings/i.test(txt), name + ' mentions Align or CHI');
  assert.ok(!/medvibe/i.test(txt), name + ' names MedVibe');
  assert.ok(!/marketplace/i.test(txt), name + ' calls Scale a marketplace');
}

assert.ok(home.includes('data-care-redesign'));
assert.ok(!home.includes('data-calming-pop'));
assert.ok(home.includes('href="/book"'));
assert.ok(home.includes('$129'));
assert.ok(home.includes('$99'));
assert.ok(home.includes('$89'));
assert.ok(!home.includes('$139'));
assert.ok(!home.includes('$189'));
assert.ok(!home.includes('Talk to Glen or Gwen now'));
assert.ok(home.includes('id="hero-book"'));
assert.ok(home.includes('Book a visit'));
assert.equal((home.match(/data-book data-book-direct/g) || []).length, 3);

assert.ok(book.includes('id="cal-days"'));
assert.ok(book.includes('id="tab-md"'));
assert.ok(book.includes('$129'));
assert.ok(book.includes('$99'));
assert.ok(book.includes('$89'));
assert.ok(!book.includes('$139'));
assert.ok(!book.includes('$189'));
assert.ok(book.includes('Text or call me to help me book. Reply STOP anytime.'));
assert.ok(book.includes('/api/openings') || fs.readFileSync('js/care-book.js', 'utf8').includes('/api/openings'));
assert.ok(openings.includes('listOpenings'));
assert.ok(lead.includes('cj-winback') || lead.includes('cj-booking-partial'));

assert.ok(bookJs.includes("CARE_BOOK = '/book'") || bookJs.includes("var CARE_BOOK = '/book'"));
assert.ok(bookJs.includes("location.replace(dest)"));
assert.ok(!/loadGuide\(/.test(bookJs), 'book.js should not auto-load the guide for Book clicks');


const llms = fs.readFileSync('llms.txt', 'utf8');
const llmsFull = fs.readFileSync('llms-full.txt', 'utf8');
const aiIndex = fs.readFileSync('ai/index.md', 'utf8');
const trainingBook = fs.readFileSync('training/book.html', 'utf8');
const trainingJs = fs.readFileSync('js/training.js', 'utf8');
for (const [name, txt] of [['llms.txt', llms], ['llms-full.txt', llmsFull], ['ai/index.md', aiIndex], ['training/book.html', trainingBook], ['js/training.js', trainingJs]]) {
  assert.ok(txt.includes('$129'), name + ' missing $129 assessment');
  assert.ok(txt.includes('$99'), name + ' missing $99 follow-up');
  assert.ok(txt.includes('$89') || name === 'js/training.js', name + ' missing $89 doctor');
  assert.ok(!txt.includes('$139') || name === 'js/training.js', name + ' has $139');
  assert.ok(!txt.includes('$189'), name + ' has $189');
  assert.ok(!/reg\. \$|regular \$189/.test(txt), name + ' has a regular-price anchor');
}
assert.ok(trainingJs.includes("price_label: 'US$139.00'"), 'ROLL US$139 product price should stay');
assert.ok(trainingBook.includes('Public member rate $129'));
assert.ok(trainingBook.includes('Public member rate $99'));

const window = {};
vm.runInNewContext(fs.readFileSync('config.js', 'utf8'), { window });
assert.strictEqual(window.CALM_JOINTS.booking.services.initial.price, 129);
assert.strictEqual(window.CALM_JOINTS.booking.services.followup.price, 99);
assert.strictEqual(window.CALM_JOINTS.md.price, 89);
assert.strictEqual(window.CALM_JOINTS.md.priceVerified, true);
assert.strictEqual(window.CALM_JOINTS.md.primaryUrl, null);

// listOpenings uses real Jane when called; here we stub fetch.
_reset();
const sample = [
  {
    id: 91,
    openings: [
      { staff_member_id: 91, location_id: 1, treatment_id: 346, duration: 3600, start_at: '2099-03-01T15:00:00-05:00', end_at: '2099-03-01T16:00:00-05:00', status: 'opening' },
      { staff_member_id: 91, location_id: 1, treatment_id: 346, duration: 3600, start_at: '2099-03-01T16:00:00-05:00', end_at: '2099-03-01T17:00:00-05:00', status: 'opening' },
    ],
  },
];
const fetchImpl = async (url) => {
  if (/\/book$/.test(url) || /\/book\?/.test(url) || url.endsWith('/book')) {
    return { ok: true, text: async () => 'App.location_id = 1;\nstaff_members: [{"id":91}],\ntreatments: [{"id":346,"name":"Initial Physio Assess"},{"id":347,"name":"Physiotherapy Session"}],\n' };
  }
  if (/\/api\/v2\/openings/.test(url)) {
    return { ok: true, json: async () => sample };
  }
  return { ok: false, text: async () => '', json: async () => [] };
};

(async () => {
  const now = new Date('2099-03-01T12:00:00-05:00');
  const data = await listOpenings({ kind: 'initial', days: 14 }, fetchImpl, now);
  assert.strictEqual(data.ok, true, JSON.stringify(data));
  assert.strictEqual(data.count, 2);
  assert.strictEqual(data.price, 129);
  assert.ok(data.days['2099-03-01']);
  assert.strictEqual(data.days['2099-03-01'].count, 2);
  assert.ok(data.slots[0].book_url.includes('/staff_member/91/treatment/346/2099-03-01'));
  assert.ok(!JSON.stringify(data).includes('Rukavina'), 'no clinician names in the calendar payload');
  assert.ok(bookUrl(91, 346, new Date('2099-03-01T15:00:00-05:00')).includes('2099-03-01'));
  console.log('care book tests ok');
})().catch((e) => { console.error(e); process.exit(1); });
