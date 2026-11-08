'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { renderAll, listedCards, renderSportPage } = require('../lib/sport-zone');

function jpegSize(buf) {
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xFF) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    if (marker === 0xD8 || marker === 0xD9) { i += 2; continue; }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('jpeg size not found');
}

const home = fs.readFileSync('index.html', 'utf8');
const nav = home.match(/class="nav-store" href="([^"]+)" data-store-place="nav">([^<]+)</);
const card = home.match(/class="ins-card" href="([^"]+)" data-store-place="home">/);
assert.ok(nav, 'homepage nav store link');
assert.ok(card, 'homepage store card link');
const navUrl = nav[1].replace(/&amp;/g, '&');
const navLabel = nav[2];
const storeUrl = card[1].replace(/&amp;/g, '&');
const storeLabel = 'Shop the Insider\u2019s Store';
assert.ok(home.includes(storeLabel), 'homepage store button label');
assert.strictEqual(navLabel, 'Insider\u2019s Store');
assert.ok(!storeUrl.includes('/portal/marketplace'), 'homepage store URL is not the old marketplace path');
assert.ok(!navUrl.includes('/portal/marketplace'));

const sport = JSON.parse(fs.readFileSync('sports/squash.json', 'utf8'));
const catalog = JSON.parse(fs.readFileSync('catalog/recovery-skus.json', 'utf8'));
assert.strictEqual(sport.widget.store_url, storeUrl);
assert.strictEqual(sport.widget.store_cta, storeLabel);
assert.strictEqual(sport.widget.nav_url, navUrl);
assert.strictEqual(sport.widget.nav_label, navLabel);
assert.strictEqual(sport.route, '/squash');
assert.deepStrictEqual(sport.cards, ['roll-r8', 'roll-r3', 'roll-stretchmat']);
assert.ok(!sport.widget.coupon, 'no coupon until one is verified');

const ids = catalog.skus.map((sku) => sku.sku_id);
assert.deepStrictEqual(ids, sport.cards);
for (const sku of catalog.skus) {
  assert.strictEqual(sku.status, 'listed');
  assert.ok(!('price_display' in sku) && !('price' in sku) && !('public_price' in sku));
  assert.ok(!JSON.stringify(sku).includes('$'));
  assert.ok(!sku.supplier_url && !sku.dest_url);
}

const { pages } = renderAll();
assert.strictEqual(pages.length, 1);
assert.strictEqual(pages[0].file, 'squash.html');
const html = pages[0].html;
assert.strictEqual(fs.readFileSync('squash.html', 'utf8'), html, 'squash.html is stale; run node scripts/build-sport-pages.js');

const homeLinks = [...html.matchAll(/href="([^"]+)" data-store-place="home"/g)];
assert.ok(homeLinks.length >= 6, 'store button repeats through the page');
for (const match of homeLinks) {
  assert.strictEqual(match[1].replace(/&amp;/g, '&'), storeUrl);
}
assert.ok(html.includes(`href="${navUrl.replace(/&/g, '&amp;')}" data-store-place="nav">${navLabel}</a>`));
assert.equal((html.match(/data-book data-book-direct/g) || []).length, 4);
assert.ok(html.includes('id="zone-hero-book"'));
assert.ok(html.includes('id="zone-physio-book"'));
assert.ok(html.includes('id="zone-sticky-book"'));
assert.ok(!html.includes('href="#book"') && !html.includes('id="book"'), 'hash #book would leave the page immediately');
assert.ok(!html.includes('janeapp.com'), 'booking URL stays in config.js');
assert.ok(html.includes('src="/config.js"') && html.includes('src="/js/book.js?v=8"'));
assert.ok(html.includes('https://www.scalehealth.ca/images/roll-recovery/r8-cutout.png'));
assert.ok(html.includes('https://www.scalehealth.ca/images/roll-recovery/r3-cutout.png'));
assert.ok(html.includes('https://www.scalehealth.ca/images/roll-recovery/stretchmat-cutout.png'));
assert.ok(!html.includes('r8plus-cutout'));
assert.ok(!html.includes('/portal/marketplace'));
assert.ok(html.includes('class="hero has-photo"'));
assert.ok(html.includes('src="/media/squash/grand-central-toc-2019.jpg"'));
assert.ok(html.includes('Photo by <a href="https://commons.wikimedia.org/wiki/File:Squash_Tournament_of_Champions_2019,_Grand_Central_Station,_NYC.jpg">Huerndy</a>'));
assert.ok(html.includes('https://creativecommons.org/licenses/by-sa/4.0/'));
assert.ok(html.includes('Not cropped'));
assert.ok(html.includes('Navy fade added in the layout'));
assert.ok(!html.includes('class="court"'), 'photo hero replaces the diagram');
assert.ok(!/J\.?P\.?\s*Morgan|PSA World|endors/i.test(html), 'no sponsor or endorsement claim');
const heroFile = fs.readFileSync('media/squash/grand-central-toc-2019.jpg');
assert.deepStrictEqual(jpegSize(heroFile), { w: 1060, h: 530 });
assert.ok(heroFile.length < 220000, 'hero file stays modest');
assert.ok(fs.readFileSync('media/squash/grand-central-toc-2019.license.txt', 'utf8').includes('CC BY-SA 4.0'));
const withoutPhoto = JSON.parse(JSON.stringify(sport));
delete withoutPhoto.hero_image;
assert.ok(renderSportPage(withoutPhoto, catalog).includes('class="court"'));

const visible = html
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/\s(?:href|src)="[^"]*"/g, '');
for (const banned of [
  'Scale Health', 'membership', 'Align', 'Jane', 'CHI', 'residual', 'Dual-Fee', 'dual fee',
  '35%', 'wholesale', 'all our margin', 'coupon', 'holiday', 'R4', 'KT Tape', 'Karakal',
  'Aircast', 'SOLE', 'Tourna', 'physio-picked', '$',
]) {
  assert.ok(!visible.includes(banned), 'public page includes ' + banned);
}
assert.ok(visible.includes('Industry Insider\u2019s Store'));
assert.ok(!visible.includes('class="coupon"'));

const window = {};
vm.runInNewContext(fs.readFileSync('config.js', 'utf8'), { window });
const booking = window.CALM_JOINTS.booking.primaryUrl;
assert.strictEqual(booking, 'https://calmjoints.janeapp.com/locations/calm-joints/book#/discipline/2/treatment/346');
const bookJs = fs.readFileSync('js/book.js', 'utf8');
assert.ok(bookJs.includes('el.href = url'));
assert.ok(bookJs.includes('data-book-direct'));

const held = JSON.parse(JSON.stringify(catalog));
held.skus.push({
  sku_id: 'roll-r4',
  brand: 'ROLL Recovery',
  name: 'R4 Body Roller',
  image_url: 'https://www.scalehealth.ca/images/roll-recovery/r4-cutout.png',
  status: 'held',
});
const heldSport = JSON.parse(JSON.stringify(sport));
heldSport.cards = ['roll-r4'];
assert.throws(() => listedCards(held, heldSport), /not listed/);

const alias = require('../lib/partner-alias');
assert.ok(alias.RESERVED_ALIASES.has('squash'));
assert.ok(alias.ALIAS_MATCHER.includes('squash$'));
const mid = fs.readFileSync('middleware.js', 'utf8');
assert.ok(mid.includes('squash$'));
assert.ok(fs.readFileSync('sitemap.xml', 'utf8').includes('https://calmjoints.org/squash'));
assert.ok(!fs.readFileSync('index.html', 'utf8').includes('/squash'), 'homepage stays unchanged');

const css = fs.readFileSync('css/sport-zone.css', 'utf8');
assert.ok(css.includes('#0A1D56') && css.includes('#00FF88') && css.includes('#9D4EDD') && css.includes('#F6F7FB'));
assert.equal((css.match(/color:\s*var\(--green\)/g) || []).length, 2);

console.log('sport-zone: store', storeUrl);
console.log('sport-zone: book', booking);
console.log('sport-zone: all checks passed');
