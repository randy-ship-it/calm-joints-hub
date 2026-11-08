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
assert.deepStrictEqual(sport.cards, ['drho-tens-pro', 'roll-r8', 'roll-r3', 'roll-stretchmat']);
assert.ok(!sport.widget.coupon, 'no coupon until one is verified');

const ids = catalog.skus.map((sku) => sku.sku_id);
assert.deepStrictEqual(ids.slice().sort(), sport.cards.slice().sort());
const TENS = 'https://drhonow.com/products/pain-therapy-system-pro-basic-package?_pos=7&_sid=51cff1b60&_ss=r&utm_source=scalehealth&utm_medium=member_portal&utm_campaign=dr_ho_featured&utm_content=pain-therapy-system-pro';
for (const sku of catalog.skus) {
  assert.strictEqual(sku.status, 'listed');
  assert.ok(!('price_display' in sku) && !('price' in sku) && !('public_price' in sku) && !('member_price' in sku));
  assert.ok(!JSON.stringify(sku).includes('$'));
  assert.ok(!sku.supplier_url);
  if (sku.sku_id === 'drho-tens-pro') assert.strictEqual(sku.dest_url, TENS);
  else assert.ok(!sku.dest_url);
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
assert.equal((html.match(/data-book data-book-direct/g) || []).length, 4 + sport.therapists.people.length);
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
assert.ok(html.includes('data-product="drho-tens-pro" href="' + TENS.replace(/&/g, '&amp;') + '"') || html.includes('href="' + TENS.replace(/&/g, '&amp;') + '" data-product="drho-tens-pro"'));
assert.equal((html.match(/data-product="drho-tens-pro"/g) || []).length, 2, 'card and hint share the verified TENS link');
assert.ok(html.includes('Pain Therapy System Pro'));
assert.ok(html.includes('Follow the maker'));
assert.ok(html.includes('data-hint="pause"'));
assert.ok(html.includes('/js/sport-hints.js?v=1'));
assert.ok(fs.readFileSync('js/sport-hints.js', 'utf8').includes('prefers-reduced-motion'));
assert.ok(fs.readFileSync('js/sport-hints.js', 'utf8').includes('Pause'));
assert.ok(html.includes('id="therapists-title"'));
assert.ok(html.includes('Physiotherapists you can book'));
assert.ok(html.includes('This row is not a live schedule.'));
assert.ok(html.includes('aria-roledescription="carousel"'));
assert.ok(html.includes('data-th="prev"') && html.includes('data-th="next"'));
assert.ok(html.includes('/js/sport-therapists.js?v=1'));
const railJs = fs.readFileSync('js/sport-therapists.js', 'utf8');
assert.ok(railJs.includes('prefers-reduced-motion'));
assert.ok(railJs.includes('#/staff_member/'));
assert.ok(railJs.includes('/treatment/'));
assert.ok(railJs.includes('ArrowLeft') && railJs.includes('ArrowRight'));
assert.deepStrictEqual(sport.therapists.people.map((p) => p.staff_id), ['95', '94', '97', '99', '96']);
assert.deepStrictEqual(sport.therapists.people.map((p) => p.name), ['Gabriela R.', 'Aleksandra N.', 'Ariel C.', 'Manpreet N.', 'Olakunle O.']);
for (const person of sport.therapists.people) {
  assert.strictEqual(person.credential, 'Physiotherapist');
  assert.strictEqual(person.region, 'Ontario');
  assert.ok(html.includes('data-staff="' + person.staff_id + '"'));
  assert.ok(html.includes('Book a video assessment with ' + person.name));
  const photo = fs.readFileSync(person.photo.replace(/^\//, ''));
  assert.strictEqual(photo.slice(0, 4).toString(), 'RIFF', person.photo);
  assert.strictEqual(photo.slice(8, 12).toString(), 'WEBP', person.photo);
  assert.ok(photo.length < 80000, person.photo);
}
for (const bannedPerson of ['Rukavina', 'Percy', 'Golanski', 'Tailor', 'Grewal', 'Taylor']) {
  assert.ok(!html.includes(bannedPerson), bannedPerson);
  assert.ok(!JSON.stringify(sport.therapists).includes(bannedPerson), bannedPerson);
}
assert.ok(!/squash specialist|live opening|available today|next opening/i.test(html));
for (const bannedCopy of ['heals', 'prevents injury', 'improves performance', 'treats', 'medically necessary', 'SCALE15']) {
  assert.ok(!html.toLowerCase().includes(bannedCopy), bannedCopy);
}
assert.ok(html.includes('class="hero has-photo"'));
assert.ok(html.includes('src="/media/squash/grand-central-toc-2019.jpg"'));
assert.ok(html.includes('Photo: <a href="https://commons.wikimedia.org/wiki/File:Squash_Tournament_of_Champions_2019,_Grand_Central_Station,_NYC.jpg">Huerndy</a>'));
assert.ok(html.includes('https://creativecommons.org/licenses/by-sa/4.0/'));
assert.ok(html.includes('· cropped'));
assert.ok(!html.includes('Not cropped'));
assert.ok(!/recompressed|navy fade|1060/i.test(html));
assert.ok(!html.includes('class="court"'), 'photo hero replaces the diagram');
assert.ok(!/J\.?P\.?\s*Morgan|PSA World|endors/i.test(html), 'no sponsor or endorsement claim');
const heroFile = fs.readFileSync('media/squash/grand-central-toc-2019.jpg');
const heroPx = jpegSize(heroFile);
assert.deepStrictEqual(heroPx, { w: sport.hero_image.width, h: sport.hero_image.height });
assert.ok(heroPx.w >= 520 && heroPx.w < 1060 && heroPx.h < 530, 'crop stays inside the source and is not a tiny zoom');
assert.ok(heroFile.length < 120000, 'hero file stays modest');
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
