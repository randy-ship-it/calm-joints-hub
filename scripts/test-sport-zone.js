'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { renderAll, listedCards, renderSportPage, mergeFamily, renderRacquetsIndex } = require('../lib/sport-zone');

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

const family = JSON.parse(fs.readFileSync('sports/_family.json', 'utf8'));
const rawSquash = JSON.parse(fs.readFileSync('sports/squash.json', 'utf8'));
assert.strictEqual(rawSquash.family, 'racquets');
assert.ok(!rawSquash.cards && !rawSquash.therapists, 'shared racquets fields stay on the family file');
const sport = mergeFamily(family, rawSquash);
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
assert.deepStrictEqual(pages.map((page) => page.file), ['badminton.html', 'paddle.html', 'pickleball.html', 'squash.html', 'tennis.html']);
const html = pages.find((page) => page.file === 'squash.html').html;
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
assert.ok(html.indexOf('class="hero') < html.indexOf('id="therapists-title"'));
assert.ok(html.indexOf('id="therapists-title"') < html.indexOf('id="hints-title"'));
assert.ok(!html.includes('Built for the court'));
assert.ok(!html.includes('Ankles and knees'));
assert.ok(html.includes('class="hint-link"'));
assert.ok(html.indexOf('id="kit"') < html.indexOf('id="insider"'));
assert.ok(html.indexOf('id="insider"') < html.indexOf('id="assessment"'));
assert.ok(html.indexOf('id="assessment"') < html.indexOf('id="guides"'));
assert.ok(html.indexOf('id="steps-title"') < html.indexOf('id="guides-title"'));
assert.ok(html.includes('Squash injury guides'));
assert.ok(html.includes('They are not a diagnosis'));
for (const guide of ['squash-ankle-sprain', 'squash-knee-pain-lunging', 'squash-shoulder-pain', 'squash-lower-back-pain']) {
  assert.ok(html.includes('/blog/' + guide));
  const article = fs.readFileSync('blog/' + guide + '.html', 'utf8');
  assert.ok(article.includes('data-book'));
  assert.ok(article.includes('general education'));
  assert.ok(!/physio team|3 out of 10|3 sets of|30 seconds|civic/i.test(article), guide);
  assert.ok(/nhs\.uk|nice\.org\.uk/.test(article), guide);
}
assert.ok(html.includes('Product Insider Access'));
assert.ok(html.includes('expected in the next few weeks'));
assert.ok(html.includes('not a purchase'));
assert.ok(html.includes('/js/sport-insider.js?v=6'));
assert.ok(html.includes('data-sport="squash"') && html.includes('data-path="/squash"'));
assert.ok(html.includes('aria-label="Racket sports"'));
assert.ok(html.includes('/api/squash-insider') === false);
const insiderClient = fs.readFileSync('js/sport-insider.js', 'utf8');
assert.ok(insiderClient.includes('/api/squash-insider'));
assert.ok(insiderClient.includes('role", "dialog"') || insiderClient.includes("role', 'dialog'") || insiderClient.includes('aria-modal'));
assert.ok(insiderClient.includes('Escape'));
assert.ok(insiderClient.includes('insider-details') && insiderClient.includes('Back to the list'));
assert.ok(insiderClient.includes('Highlights') && insiderClient.includes("setAttribute('role', 'tab')"));
assert.ok(insiderClient.includes('Insider pricing coming soon'));
assert.ok(!insiderClient.includes('in your cart'));
for (const file of [html, insiderClient, fs.readFileSync('css/sport-zone.css', 'utf8')]) {
  assert.ok(!/randy\s*30|randywholesale/i.test(file), 'access code stays off the public page');
}
assert.ok(!/wholesale/i.test(insiderClient));
assert.ok(!/wholesale/i.test(fs.readFileSync('css/sport-zone.css', 'utf8')));
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
assert.ok(html.includes('content="https://calmjoints.org/media/squash/share-preview.jpg"'));
assert.equal((html.match(/media\/squash\/share-preview\.jpg/g) || []).length, 2, 'share image is og and twitter only');
assert.ok(!html.includes('src="/media/squash/share-preview.jpg"'));
assert.ok(fs.readFileSync('index.html', 'utf8').includes('/media/cj-og-1200x630.png'));
assert.ok(!fs.readFileSync('index.html', 'utf8').includes('share-preview'));
const shareJpg = fs.readFileSync('media/squash/share-preview.jpg');
assert.deepStrictEqual(jpegSize(shareJpg), { w: 1179, h: 840 });
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
  '35%', 'all our margin', 'coupon', 'holiday', 'R4', 'KT Tape', 'Karakal',
  'Aircast', 'SOLE', 'Tourna', 'physio-picked', '$',
]) {
  assert.ok(!visible.includes(banned), 'public page includes ' + banned);
}
assert.ok(visible.includes('Industry Insider\u2019s Store'));
assert.ok(!visible.includes('class="coupon"'));
assert.ok(html.includes('id="club-partner"') && html.includes('Run a private club? Partner with us'));
assert.ok(html.includes('Tier 1 · Physio only') && html.includes('Tier 2 · Full recovery activation'));
assert.ok(html.includes('25% payout on net revenue'));
assert.ok(html.includes('across the province'));
assert.ok(html.includes('co-branded member store at wholesale rates'));
assert.ok(html.includes('wrist, elbow or knee niggles from lunges and quick turns'));
assert.ok(html.includes('Request a Physio QR') && html.includes('Request full recovery activation'));
assert.ok(html.includes('id="club-qr-form"') && html.includes('name="club"') && html.includes('name="email"'));
assert.ok(html.includes('/js/sport-club.js?v=2'));
assert.ok(html.indexOf('id="guides"') < html.indexOf('id="club-partner"'));
assert.ok(html.indexOf('id="club-partner"') < html.indexOf('<footer>'));
const clubChunk = html.slice(html.indexOf('id="club-partner"'), html.indexOf('<footer>'));
assert.ok(/wholesale/i.test(clubChunk));
assert.ok(!/wholesale/i.test(html.slice(0, html.indexOf('id="club-partner"'))));
assert.ok(!/canada-wide in-person|8\.7mm|MedVibe|Scale Health Connect/i.test(html));
// Prominent club CTA: strip near the top, pill, and modal with sport-matched visuals.
assert.ok(html.includes('id="club-strip"'), 'club strip renders');
assert.ok(html.indexOf('id="club-strip"') < html.indexOf('id="kit"'), 'club strip sits above the kit');
assert.ok(html.includes('data-club-open="physio"') && html.includes('data-club-open="full"'), 'both tiers open the modal');
assert.ok(html.includes('See the club QR') && html.includes('See the member store'));
assert.ok(html.includes('id="club-modal"') && html.includes('role="dialog"') && html.includes('aria-modal="true"'));
assert.ok(html.includes('data-club-panel="physio"') && html.includes('data-club-panel="full"'));
assert.ok(html.includes('/media/club/club-qr-squash.jpg') && html.includes('/media/club/club-store.jpg'));
assert.ok(html.includes('id="club-pill"') && html.includes('Club partners'));
assert.ok(html.includes('href="/enterprise#estimate"') && html.includes('Try the opportunity calculator'));
assert.ok(html.indexOf('id="club-qr-form"') > html.indexOf('id="club-modal"'), 'form lives in the modal');
const stripChunk = html.slice(html.indexOf('id="club-strip"'), html.indexOf('id="kit"'));
assert.ok(!/contractor|canada-wide/i.test(html), 'banned words');
assert.ok(!/wholesale/i.test(stripChunk), 'strip stays soft');
for (const f of ['club-qr-squash.jpg', 'club-qr-tennis.jpg', 'club-qr-pickleball.jpg', 'club-store.jpg']) {
  const buf = fs.readFileSync('media/club/' + f);
  assert.ok(buf.length < 220000, f + ' stays modest');
  assert.deepStrictEqual(jpegSize(buf), { w: 1200, h: 900 }, f);
}

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
const homeNow = fs.readFileSync('index.html', 'utf8');
assert.ok(!homeNow.includes('squash-tease'));
assert.ok(!homeNow.includes('racquet-teases'));
assert.ok(!homeNow.includes('Squash Insiders'));
assert.ok(!homeNow.includes('recovery page is open'));
assert.ok(!homeNow.includes('See Squash'));
const footStart = homeNow.indexOf('<footer>');
assert.ok(footStart > 0);
const foot = homeNow.slice(footStart);
assert.ok(foot.includes('data-foot-racquets'));
assert.ok(foot.includes('id="foot-racquets-btn"') && foot.includes('aria-haspopup="true"') && foot.includes('aria-controls="foot-racquets-menu"'));
assert.ok(foot.includes('href="/squash">Squash</a>') && foot.includes('href="/tennis">Tennis</a>'));
assert.ok(foot.includes('href="/pickleball">Pickleball</a>') && foot.includes('href="/paddle">Padel</a>'));
assert.ok(!homeNow.slice(0, footStart).includes('href="/squash"'));
assert.ok(!homeNow.includes('href="/racquets">Racquets</a>'));
const llms = fs.readFileSync('llms.txt', 'utf8');
for (const url of ['https://calmjoints.org/squash', 'https://calmjoints.org/tennis', 'https://calmjoints.org/pickleball', 'https://calmjoints.org/paddle', 'https://calmjoints.org/racquets']) {
  assert.ok(llms.includes(url), 'llms missing ' + url);
}

const css = fs.readFileSync('css/sport-zone.css', 'utf8');
assert.ok(css.includes('#0A1D56') && css.includes('#00FF88') && css.includes('#9D4EDD') && css.includes('#F6F7FB'));
assert.equal((css.match(/color:\s*var\(--green\)/g) || []).length, 2);

for (const page of pages) {
  if (page.file === 'squash.html') continue;
  const body = page.html;
  assert.deepStrictEqual(page.sport.cards, sport.cards);
  assert.deepStrictEqual(page.sport.therapists.people.map((p) => p.staff_id), sport.therapists.people.map((p) => p.staff_id));
  assert.strictEqual(page.sport.widget.store_url, sport.widget.store_url);
  assert.strictEqual(page.sport.physio.button, sport.physio.button);
  assert.ok(!body.includes('id="guides"'), page.file);
  assert.ok(!body.includes('/blog/squash-'), page.file);
  assert.ok(body.includes('data-sport="' + page.sport.sport_id + '"'));
  assert.ok(body.includes('data-path="' + page.sport.route + '"'));
  assert.ok(body.includes('/js/sport-insider.js?v=6'));
  assert.ok(body.includes('src="/config.js"') && body.includes('src="/js/book.js?v=8"'));
  assert.ok(!body.includes('janeapp.com'));
  assert.ok(body.includes(page.sport.hero_image.license));
  assert.ok(body.includes(page.sport.hero_image.author));
  assert.ok(body.includes('· cropped'));
  const hero = fs.readFileSync(page.sport.hero_image.src.replace(/^\//, ''));
  assert.deepStrictEqual(jpegSize(hero), { w: page.sport.hero_image.width, h: page.sport.hero_image.height });
  assert.ok(hero.length < 180000, page.file);
  assert.ok(fs.readFileSync(page.sport.hero_image.src.replace(/^\//, '').replace(/\.jpg$/, '.license.txt'), 'utf8').includes(page.sport.hero_image.license));
  for (const banned of ['randywholesale', 'heals', 'treats', 'physio-picked', '$']) {
    assert.ok(!body.toLowerCase().includes(banned), page.file + ' ' + banned);
  }
  const isClubPage = page.file === 'tennis.html' || page.file === 'pickleball.html';
  if (isClubPage) {
    assert.ok(body.includes('id="club-partner"'), page.file);
    assert.ok(body.includes('Run a private club? Partner with us'), page.file);
    assert.ok(body.includes('Tier 1 · Physio only') && body.includes('Tier 2 · Full recovery activation'), page.file);
    assert.ok(body.includes('25% payout on net revenue'), page.file);
    assert.ok(body.includes('co-branded member store at wholesale rates'), page.file);
    assert.ok(body.includes('/js/sport-club.js?v=2'), page.file);
    assert.ok(body.includes('id="club-strip"') && body.includes('id="club-modal"') && body.includes('id="club-pill"'), page.file);
    assert.ok(body.includes('/media/club/club-qr-' + page.sport.sport_id + '.jpg'), page.file + ' sport QR image');
    const start = body.indexOf('id="club-partner"');
    assert.ok(!/wholesale/i.test(body.slice(0, start)), page.file + ' wholesale outside club nudge');
  } else {
    assert.ok(!body.includes('id="club-partner"'), page.file);
    assert.ok(!body.includes('id="club-strip"') && !body.includes('id="club-pill"'), page.file);
    assert.ok(!/wholesale/i.test(body), page.file + ' wholesale');
  }
}
assert.ok(pages.find((page) => page.file === 'tennis.html').html.includes('tennis elbow, shoulder strain'));
assert.ok(pages.find((page) => page.file === 'pickleball.html').html.includes('knees, Achilles issues, and falls'));
const paddle = pages.find((page) => page.file === 'paddle.html');
assert.strictEqual(paddle.sport.route, '/paddle');
assert.strictEqual(paddle.sport.sport_id, 'padel');
assert.ok(paddle.html.includes('>Padel<'));
assert.ok(paddle.html.includes('enclosed-court'));
assert.ok(paddle.html.includes('glass and mesh'));
assert.ok(paddle.html.includes('<title>Padel | Calm Joints</title>'));
assert.ok(!paddle.sport.sub.toLowerCase().includes('pickleball'));
assert.ok(!paddle.sport.sub.toLowerCase().includes('platform tennis'));
assert.ok(fs.readFileSync('sitemap.xml', 'utf8').includes('https://calmjoints.org/tennis'));
assert.ok(fs.readFileSync('sitemap.xml', 'utf8').includes('https://calmjoints.org/pickleball'));
assert.ok(fs.readFileSync('sitemap.xml', 'utf8').includes('https://calmjoints.org/paddle'));
assert.ok(mid.includes('paddle$') && mid.includes('pickleball$') && mid.includes('tennis$'));
assert.ok(mid.includes('badminton$') && mid.includes('racquets$'));
for (const name of ['tennis', 'pickleball', 'paddle', 'badminton', 'racquets']) assert.ok(alias.RESERVED_ALIASES.has(name), name);
const badminton = pages.find((page) => page.file === 'badminton.html');
assert.strictEqual(badminton.sport.route, '/badminton');
assert.strictEqual(badminton.sport.sport_id, 'badminton');
assert.ok(badminton.html.includes('Stay quick at the net.'));
assert.ok(badminton.html.includes('Murray Foubister'));
assert.ok(badminton.html.includes('CC BY-SA 2.0'));
assert.ok(badminton.html.includes('overhead smashes'));
assert.ok(badminton.html.includes('deep lunge loads the front knee'));
assert.ok(badminton.html.includes('overhead smash asks a lot of the shoulder'));
assert.ok(badminton.html.includes('landing keeps nagging the ankle'));
assert.ok(badminton.html.includes('href="/badminton" aria-current="page"'));
assert.ok(badminton.html.includes('href="/racquets">Racquets</a>'));
assert.ok(html.includes('>Badminton</a>') && html.includes('href="/racquets">Racquets</a>'));
assert.ok(fs.readFileSync('sitemap.xml', 'utf8').includes('https://calmjoints.org/badminton'));
assert.ok(fs.readFileSync('sitemap.xml', 'utf8').includes('https://calmjoints.org/racquets'));
assert.ok(fs.readFileSync('index.html', 'utf8').includes('data-foot-racquets'));
const indexHtml = renderRacquetsIndex(family, pages);
assert.strictEqual(fs.readFileSync('racquets.html', 'utf8'), indexHtml, 'racquets.html is stale; run node scripts/build-sport-pages.js');
for (const href of ['/squash', '/tennis', '/pickleball', '/paddle', '/badminton']) {
  assert.ok(indexHtml.includes('href="' + href + '"'), href);
}
assert.ok(indexHtml.includes('aria-current="page">Racquets</a>'));
assert.ok(indexHtml.includes('Five court sports.'));
const indexVisible = indexHtml.replace(/<script[\s\S]*?<\/script>/g, '').replace(/\s(?:href|src)="[^"]*"/g, '');
for (const banned of ['Scale Health', 'membership', 'residual', 'Dual-Fee', 'dual fee', 'wholesale']) {
  assert.ok(!indexVisible.includes(banned), 'racquets index includes ' + banned);
}

console.log('sport-zone: store', storeUrl);
console.log('sport-zone: book', booking);
console.log('sport-zone: all checks passed');
