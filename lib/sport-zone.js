'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function pageName(route) {
  if (!/^\/[a-z0-9-]+$/.test(route || '')) throw new Error('Bad sport route: ' + route);
  return route.slice(1) + '.html';
}

function couponReady(widget) {
  const coupon = widget && widget.coupon;
  if (!widget || widget.show_coupon_if_verified === false || !coupon) return false;
  return ['code', 'terms_url', 'eligibility', 'verified_at'].every((key) => String(coupon[key] || '').trim());
}

function listedCards(catalog, sport) {
  const byId = new Map((catalog.skus || []).map((sku) => [sku.sku_id, sku]));
  const max = Number.isFinite(sport.max_cards) ? sport.max_cards : 8;
  const ids = Array.isArray(sport.cards) ? sport.cards : [];
  if (!ids.length) throw new Error((sport.route || 'sport') + ' has no cards');
  if (ids.length > max) throw new Error((sport.route || 'sport') + ' exceeds max_cards');
  const seen = new Set();
  return ids.map((id) => {
    if (seen.has(id)) throw new Error('Duplicate sku ' + id);
    seen.add(id);
    const sku = byId.get(id);
    if (!sku) throw new Error('Unknown sku ' + id);
    if (sku.status !== 'listed') throw new Error(id + ' is not listed');
    if (!/^https:\/\//i.test(sku.image_url || '')) throw new Error(id + ' needs an https image');
    if (sku.price_display || sku.public_price || sku.member_price || sku.price) {
      throw new Error(id + ' must not carry a price on the public page');
    }
    if (sku.dest_url && !/^https:\/\//.test(sku.dest_url)) {
      throw new Error(id + ' dest_url must be https');
    }
    const copy = (sport.card_copy && sport.card_copy[id]) || {};
    if (!String(copy.tag || '').trim() || !String(copy.line || '').trim()) {
      throw new Error(id + ' needs tag and line');
    }
    return { sku, copy };
  });
}

const COURT = `<svg class="court" viewBox="0 0 160 244" role="img" aria-label="A squash court, seen from above">
  <rect x="8" y="8" width="144" height="228" rx="8" fill="#F6F7FB" fill-opacity=".08" stroke="#F6F7FB" stroke-width="2.5"/>
  <line x1="8" y1="18" x2="152" y2="18" stroke="#00FF88" stroke-width="3"/>
  <line x1="8" y1="108" x2="152" y2="108" stroke="#00FF88" stroke-width="2"/>
  <line x1="80" y1="108" x2="80" y2="236" stroke="#F6F7FB" stroke-width="2"/>
  <rect x="18" y="118" width="52" height="36" fill="none" stroke="#00FF88" stroke-width="1.5" opacity=".9"/>
  <rect x="90" y="118" width="52" height="36" fill="none" stroke="#00FF88" stroke-width="1.5" opacity=".9"/>
</svg>`;

function storeButton(href, label, place) {
  return `<a class="btn btn-store" href="${esc(href)}" data-store-place="${esc(place)}">${esc(label)} <span aria-hidden="true">→</span></a>`;
}

function productButton(href, label, skuId) {
  return `<a class="btn btn-store" href="${esc(href)}" data-product="${esc(skuId)}" target="_blank" rel="noopener noreferrer">${esc(label)} <span aria-hidden="true">→</span></a>`;
}

function bookButton(id, label, className) {
  return `<a class="${className}" id="${esc(id)}" href="#" data-book data-book-direct>${esc(label)}</a>`;
}

const THERAPIST_NAME_BAN = /rukavina|percy|golanski|tailor|grewal|\balign\b|\bjane\b/i;

function renderInsider(sport) {
  const block = sport.insider;
  if (!block) return '';
  for (const key of ['heading', 'stocking', 'interest', 'prompt']) {
    if (!String(block[key] || '').trim()) throw new Error(sport.route + ' insider needs ' + key);
  }
  const pub = [block.heading, block.stocking, block.interest, block.prompt].join(' ').toLowerCase();
  if (/randy\s*30|wholesale|\$|30\s*%|35\s*%|margin|coupon/.test(pub)) {
    throw new Error(sport.route + ' insider public copy is not allowed');
  }
  return `<section class="insider" id="insider" aria-labelledby="insider-title">
    <div class="wrap">
      <h2 id="insider-title">${esc(block.heading)}</h2>
      <p>${esc(block.stocking)}</p>
      <p>${esc(block.interest)}</p>
      <form class="insider-gate" id="insider-gate" data-sport="${esc(sport.sport_id || '')}" data-path="${esc(sport.route)}" novalidate>
        <label for="insider-code">${esc(block.prompt)}</label>
        <div class="insider-row">
          <input id="insider-code" name="code" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="40" required>
          <button class="btn btn-book" type="submit">Continue</button>
        </div>
        <p class="insider-hp"><label>Company <input name="company" type="text" tabindex="-1" autocomplete="off"></label></p>
        <p class="insider-status" id="insider-gate-status" role="status"></p>
      </form>
      <p class="insider-share"><button type="button" id="insider-share">Share this page</button> <span id="insider-share-status" role="status"></span></p>
      <div id="insider-shop" hidden></div>
    </div>
  </section>`;
}

function renderTherapists(sport) {
  const block = sport.therapists;
  if (!block) return '';
  const people = Array.isArray(block.people) ? block.people : [];
  if (!people.length) throw new Error(sport.route + ' therapists list is empty');
  if (!String(block.heading || '').trim() || !String(block.note || '').trim()) {
    throw new Error(sport.route + ' therapists need a heading and a note');
  }
  const seen = new Set();
  const cards = people.map((person) => {
    for (const key of ['name', 'credential', 'region', 'photo', 'alt', 'staff_id']) {
      if (!String(person[key] || '').trim()) throw new Error(sport.route + ' therapist needs ' + key);
    }
    if (THERAPIST_NAME_BAN.test(person.name + ' ' + person.alt)) {
      throw new Error(sport.route + ' therapist name is not allowed');
    }
    if (!String(person.photo).startsWith('/media/')) throw new Error(person.name + ' photo must be a local file');
    if (!/^\d+$/.test(String(person.staff_id))) throw new Error(person.name + ' needs a numeric staff id');
    if (seen.has(person.staff_id)) throw new Error('Duplicate therapist ' + person.staff_id);
    seen.add(person.staff_id);
    const width = Number(person.width);
    const height = Number(person.height);
    if (!width || !height || width > 800 || height > 1000) {
      throw new Error(person.name + ' photo is too large for a compact card');
    }
    const file = path.join(ROOT, person.photo.replace(/^\//, ''));
    if (!fs.existsSync(file)) throw new Error(person.name + ' photo is missing');
    return `<li class="th-card">
          <img src="${esc(person.photo)}" alt="${esc(person.alt)}" width="${width}" height="${height}" loading="lazy" decoding="async">
          <h3>${esc(person.name)}</h3>
          <p class="cred">${esc(person.credential)} · ${esc(person.region)}</p>
          <a class="btn btn-book th-book" href="#" data-book data-book-direct data-staff="${esc(person.staff_id)}" aria-label="Book a video assessment with ${esc(person.name)}">Book</a>
        </li>`;
  }).join('\n        ');
  return `<section class="therapists" aria-roledescription="carousel" aria-labelledby="therapists-title">
    <div class="wrap">
      <div class="th-head">
        <div>
          <h2 id="therapists-title">${esc(block.heading)}</h2>
          <p class="th-note">${esc(block.note)}</p>
        </div>
        <div class="th-ctl">
          <button type="button" data-th="prev" aria-label="Previous physiotherapist">←</button>
          <button type="button" data-th="next" aria-label="Next physiotherapist">→</button>
        </div>
      </div>
      <ul class="th-rail" tabindex="0" aria-label="Physiotherapists. Swipe sideways.">
        ${cards}
      </ul>
    </div>
  </section>`;
}

function focusStyle(img, route) {
  const x = String(img.focus_x || '').trim();
  const y = String(img.focus_y || '').trim();
  if (!x && !y) return '';
  if (!/^\d{1,3}%$/.test(x) || !/^\d{1,3}%$/.test(y)) throw new Error(route + ' hero focus must be a percentage');
  return ` style="--hero-x:${x};--hero-y:${y}"`;
}

function heroFigure(sport) {
  const img = sport.hero_image;
  if (!img) return COURT;
  for (const key of ['src', 'alt', 'author', 'source_label', 'source_url', 'license', 'license_url', 'changes']) {
    if (!String(img[key] || '').trim()) throw new Error(sport.route + ' hero_image.' + key + ' is required');
  }
  if (!String(img.src).startsWith('/media/')) throw new Error(sport.route + ' hero image must be a local file');
  if (!/^https:\/\//.test(img.source_url) || !/^https:\/\//.test(img.license_url)) {
    throw new Error(sport.route + ' hero credit links must be https');
  }
  const width = Number(img.width);
  const height = Number(img.height);
  if (!width || !height || width > 1600 || height > 1200) {
    throw new Error(sport.route + ' hero image is larger than a modest hero');
  }
  const source = esc(img.source_url);
  const note = esc(img.changes);
  return `<figure class="hero-photo">
        <div class="hero-frame"${focusStyle(img, sport.route)}>
          <img src="${esc(img.src)}" alt="${esc(img.alt)}" width="${width}" height="${height}" fetchpriority="high" decoding="async">
        </div>
        <figcaption class="hero-credit">Photo: <a href="${source}">${esc(img.author)}</a> / <a href="${source}">${esc(img.source_label)}</a> · <a href="${esc(img.license_url)}" rel="license noopener noreferrer" target="_blank">${esc(img.license)}</a> · ${note}</figcaption>
      </figure>`;
}

function hintHref(item, sport, catalog, widget) {
  const href = item.href || '';
  if (!href) return '';
  if (href === 'store') return { href: widget.store_url, attrs: ' data-store-place="home"' };
  if (href.startsWith('sku:')) {
    const id = href.slice(4);
    const sku = (catalog.skus || []).find((row) => row.sku_id === id);
    if (!sku || !sku.dest_url) throw new Error(sport.route + ' hint missing product link for ' + id);
    return { href: sku.dest_url, attrs: ' data-product="' + esc(id) + '" target="_blank" rel="noopener noreferrer"' };
  }
  if (href.startsWith('#') || href.startsWith('/')) return { href, attrs: '' };
  throw new Error(sport.route + ' hint link is not allowed: ' + href);
}

function renderHints(sport, catalog, widget) {
  const hints = sport.hints;
  if (!hints || !Array.isArray(hints.items) || !hints.items.length) return '';
  const items = hints.items.map((item) => {
    if (!String(item.text || '').trim()) throw new Error(sport.route + ' hint needs text');
    const dest = hintHref(item, sport, catalog, widget);
    const link = dest && item.link
      ? `<a class="hint-link" href="${esc(dest.href)}"${dest.attrs}>${esc(item.link)}</a>`
      : '';
    return `<li><p>${esc(item.text)}</p>${link}</li>`;
  }).join('');
  return `<section class="hints" aria-labelledby="hints-title">
    <div class="wrap hints-bar">
      <h2 id="hints-title">${esc(hints.label || 'Hints')}</h2>
      <ul class="hints-list" data-hints>${items}</ul>
      <div class="hints-ctl">
        <button type="button" data-hint="prev" aria-label="Previous hint">←</button>
        <button type="button" data-hint="pause" aria-pressed="false">Pause</button>
        <button type="button" data-hint="next" aria-label="Next hint">→</button>
      </div>
    </div>
  </section>`;
}

function renderGuides(sport) {
  const guides = Array.isArray(sport.guides) ? sport.guides : [];
  if (!guides.length) return '';
  const items = guides.map((guide) => (
    `<li><a href="${esc(guide.href)}"><strong>${esc(guide.title)}</strong><span>${esc(guide.line)}</span></a></li>`
  )).join('');
  return `<section class="guides" id="guides" aria-labelledby="guides-title">
    <div class="wrap">
      <h2 id="guides-title">${esc(sport.guides_heading || 'Guides')}</h2>
      <p class="guides-note">${esc(sport.guides_note || '')}</p>
      <ul class="guide-list">${items}</ul>
    </div>
  </section>`;
}

const CLUB_CALC_URL = '/enterprise#estimate';

function clubImages(sport) {
  const club = sport.club_nudge || {};
  const qr = club.qr_image || `/media/club/club-qr-${sport.sport_id}.jpg`;
  const qrWall = club.qr_wall_image || `/media/club/club-qr-${sport.sport_id}-wall.jpg`;
  const store = club.store_image || '/media/club/club-store.jpg';
  for (const src of [qr, qrWall, store]) {
    if (!String(src).startsWith('/media/')) throw new Error(sport.route + ' club image must be a local file');
    if (!fs.existsSync(path.join(ROOT, src.replace(/^\//, '')))) throw new Error(sport.route + ' club image is missing: ' + src);
  }
  return { qr, qrWall, store };
}

// <picture> with small and large WebP variants when they exist, and the JPEG as the fallback.
function clubPicture(src, alt, sizes, extra) {
  const base = src.replace(/\.jpg$/, '');
  const small = base + '-640.webp';
  const large = base + '-1200.webp';
  const has = (file) => fs.existsSync(path.join(ROOT, file.replace(/^\//, '')));
  const source = has(small) && has(large)
    ? `<source type="image/webp" srcset="${esc(small)} 640w, ${esc(large)} 1200w" sizes="${esc(sizes)}">`
    : '';
  return `<picture>${source}<img src="${esc(src)}" alt="${esc(alt)}" width="1200" height="900" loading="lazy" decoding="async"${extra || ''}></picture>`;
}

function clubReady(sport) {
  const club = sport.club_nudge;
  return Boolean(club && club.example && club.tier1 && club.tier2);
}

function clubCalcLink(place) {
  return `<a class="club-calc" href="${CLUB_CALC_URL}" target="_blank" rel="noopener" data-club-calc="${esc(place)}">Try the opportunity calculator<span aria-hidden="true"> →</span></a>`;
}

const ICON_QR = '<svg class="club-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm8-2h2v2h-2v-2zm4 0h4v2h-2v2h-2v-4zm-4 4h2v2h2v2h-4v-4zm6 2h2v2h-2v-2z"/></svg>';
const ICON_STORE = '<svg class="club-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 4h16l1 5a3 3 0 0 1-2 2.83V20H5v-8.17A3 3 0 0 1 3 9l1-5zm1.6 2-.6 3a1 1 0 0 0 2 0V6H5.6zM9 6v3a1 1 0 0 0 2 0V6H9zm4 0v3a1 1 0 0 0 2 0V6h-2zm4 0v3a1 1 0 0 0 2 0l-.6-3H17zM7 12v6h10v-6a3 3 0 0 1-2-.78 3 3 0 0 1-3 .78 3 3 0 0 1-3-.78A3 3 0 0 1 7 12z"/></svg>';

function renderClubStrip(sport) {
  if (!clubReady(sport)) return '';
  const sportName = String(sport.nav_current || '').toLowerCase();
  const img = clubImages(sport);
  return `<section class="club-strip" id="club-strip" aria-labelledby="club-strip-title">
    <div class="wrap">
      <div class="club-strip-card">
        <button type="button" class="club-strip-thumb" data-club-open="physio" aria-haspopup="dialog" aria-controls="club-modal" aria-label="See the co-branded club QR at court side">
          ${clubPicture(img.qr, '', '140px')}
        </button>
        <div class="club-strip-copy">
          <p class="club-strip-kicker"><span class="club-dot" aria-hidden="true"></span>For private clubs</p>
          <h2 class="club-strip-title" id="club-strip-title">Physio for your members. Revenue for your club.</h2>
          <p class="club-strip-line">Put a co-branded physio QR on your ${esc(sportName)} courts, or open a member recovery store. Hands-off for your staff.</p>
          ${clubCalcLink('strip')}
        </div>
        <div class="club-strip-actions">
          <button type="button" class="club-open club-open-qr" data-club-open="physio" aria-haspopup="dialog" aria-controls="club-modal">
            ${ICON_QR}<span class="club-open-text"><span class="club-open-tier">Tier 1 · Physio QR</span><span class="club-open-label">See the club QR</span></span><span class="club-open-arrow" aria-hidden="true">→</span>
          </button>
          <button type="button" class="club-open club-open-store" data-club-open="full" aria-haspopup="dialog" aria-controls="club-modal">
            ${ICON_STORE}<span class="club-open-text"><span class="club-open-tier">Tier 2 · Member store</span><span class="club-open-label">See the member store</span></span><span class="club-open-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  </section>`;
}

function renderClubNudge(sport) {
  if (!clubReady(sport)) return '';
  const club = sport.club_nudge;
  const img = clubImages(sport);
  const sportName = String(sport.nav_current || '');
  const lower = sportName.toLowerCase();
  const wallLabel = club.wall_label || 'Wall or glass mount';
  const wallWhere = club.wall_where || 'on the wall or the court glass';
  return `<section class="club-nudge" id="club-partner" data-club-sport="${esc(sport.sport_id)}" data-club-path="${esc(sport.route)}" aria-labelledby="club-band-title">
    <div class="wrap">
      <div class="club-band">
        <div class="club-band-head">
          <p class="club-strip-kicker"><span class="club-dot" aria-hidden="true"></span>For private clubs</p>
          <h2 id="club-band-title">Run a private club? Partner with us</h2>
          <p class="club-benefit">Better recovery for members, a new revenue line for the club, nothing extra for staff.</p>
          <p class="club-frame">Activate a co-branded QR code at your club. Members who book get care from registered therapists across the province. Club profit goes up, and the burden on member fees goes down. It’s hands-off.</p>
          <p class="club-example">${esc(club.example)}</p>
        </div>
        <div class="club-tiers">
          <article class="club-tier club-tier-qr">
            <button type="button" class="club-tier-visual" data-club-open="physio" aria-haspopup="dialog" aria-controls="club-modal" aria-label="See the co-branded club QR">
              ${clubPicture(img.qr, '', '(min-width: 760px) 500px, 92vw')}
              <span class="club-tier-badge" aria-hidden="true">Tier 1 · Physio QR</span>
            </button>
            <h3>Tier 1 · Physio only</h3>
            <p class="club-tier-fact"><strong>25%</strong> of net booking revenue to the club</p>
            <p>${esc(club.tier1)}</p>
            <button type="button" class="btn club-cta club-cta-qr" data-club-tier="physio" aria-haspopup="dialog" aria-controls="club-modal">Request a Physio QR<span aria-hidden="true"> →</span></button>
          </article>
          <article class="club-tier club-tier-store">
            <button type="button" class="club-tier-visual" data-club-open="full" aria-haspopup="dialog" aria-controls="club-modal" aria-label="See the co-branded member store">
              ${clubPicture(img.store, '', '(min-width: 760px) 500px, 92vw')}
              <span class="club-tier-badge" aria-hidden="true">Tier 2 · Member store</span>
            </button>
            <h3>Tier 2 · Full recovery activation</h3>
            <p class="club-tier-fact"><strong>Wholesale</strong> member pricing, physio built in</p>
            <p>${esc(club.tier2)}</p>
            <button type="button" class="btn club-cta club-cta-store" data-club-tier="full" aria-haspopup="dialog" aria-controls="club-modal">Request full recovery activation<span aria-hidden="true"> →</span></button>
          </article>
        </div>
        <p class="club-calc-row">Curious what it could look like for your club? ${clubCalcLink('band')} <span class="club-calc-note">Illustrative only, not a payout guarantee.</span></p>
      </div>
    </div>
  </section>
  <div class="club-modal" id="club-modal" role="dialog" aria-modal="true" aria-labelledby="club-modal-title" data-view="physio" hidden>
    <div class="club-modal-backdrop" data-club-close></div>
    <div class="club-modal-dialog" tabindex="-1">
      <div class="club-modal-top">
        <div class="club-modal-tabs" role="group" aria-label="Partnership tier">
          <button type="button" class="club-tab" data-club-view="physio" aria-pressed="true">Tier 1 · Physio QR</button>
          <button type="button" class="club-tab" data-club-view="full" aria-pressed="false">Tier 2 · Member store</button>
        </div>
        <button type="button" class="club-modal-close" data-club-close aria-label="Close">×</button>
      </div>
      <div class="club-view" data-club-panel="physio">
        <figure class="club-visual">
          <div class="club-place" role="group" aria-label="Sign placement">
            <button type="button" data-club-place="stand" aria-pressed="true">Stand-up sign</button>
            <button type="button" data-club-place="wall" aria-pressed="false">${esc(wallLabel)}</button>
          </div>
          <div class="club-place-img" data-club-place-img="stand">${clubPicture(img.qr, `Mockup: a 24 by 36 inch co-branded Calm Joints and Your Club stand-up sign with a QR code, at the side of a ${lower} court.`, '(min-width: 640px) 568px, 100vw')}</div>
          <div class="club-place-img" data-club-place-img="wall" hidden>${clubPicture(img.qrWall, `Mockup: a compact co-branded Calm Joints and Your Club sign with a QR code, mounted ${wallWhere} at a ${lower} court.`, '(min-width: 640px) 568px, 100vw')}</div>
          <figcaption>Illustrative mockups: a 24 × 36 in stand-up sign at court side, or a compact sign ${esc(wallWhere)}. Your club’s logo goes where it says Your Club. The code opens calmjoints.org${esc(sport.route)}.</figcaption>
        </figure>
        <h2 id="club-modal-title" class="club-modal-title">A co-branded physio QR for your courts</h2>
        <p class="club-modal-copy">${esc(club.tier1)}</p>
        <ul class="club-points"><li>Sign, cards and code made for your club</li><li>Booking and care handled for you</li><li>No staff time or inventory</li></ul>
      </div>
      <div class="club-view" data-club-panel="full" hidden>
        <figure class="club-visual">
          ${clubPicture(img.store, 'Mockup: a co-branded Calm Joints and Your Club member store on a phone-sized card, with recovery products and care options.', '(min-width: 640px) 568px, 100vw')}
          <figcaption>Illustrative mockup of a co-branded member store. Your club’s logo goes where it says Your Club.</figcaption>
        </figure>
        <h2 class="club-modal-title">A co-branded member recovery store</h2>
        <p class="club-modal-copy">${esc(club.tier2)}</p>
        <ul class="club-points"><li>Your club’s name on the store</li><li>Physio booking built in, same as Tier 1</li><li>Orders and care handled for you</li></ul>
      </div>
      <p class="club-calc-row club-calc-modal">See what the opportunity could look like. ${clubCalcLink('modal')}</p>
      <form class="club-form" id="club-qr-form" novalidate>
        <h3 id="club-form-title">Request a co-branded QR</h3>
        <p class="club-form-lead">We’ll use this to set up your code and get back to you.</p>
        <div class="club-form-grid">
          <label>Club name <input name="club" type="text" autocomplete="organization" maxlength="120" required></label>
          <label>Contact name <input name="name" type="text" autocomplete="name" maxlength="80" required></label>
          <label>Email <input name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" required></label>
          <label>Phone <span class="club-optional">(optional)</span> <input name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="40"></label>
          <label>Sport <input name="sport_label" type="text" value="${esc(sport.nav_current)}" readonly></label>
          <label>Tier
            <select name="tier" required>
              <option value="physio">Physio only</option>
              <option value="full">Full recovery activation</option>
            </select>
          </label>
        </div>
        <input type="hidden" name="sport" value="${esc(sport.sport_id)}">
        <input type="hidden" name="path" value="${esc(sport.route)}">
        <label>Note <span class="club-optional">(optional)</span> <textarea name="message" rows="3" maxlength="1000"></textarea></label>
        <p class="club-hp"><label>Company <input name="company" type="text" tabindex="-1" autocomplete="off"></label></p>
        <button class="btn club-submit" type="submit">Send request</button>
        <p class="club-form-note">No cost to request. A person follows up by email.</p>
        <p class="club-status" role="status"></p>
      </form>
      <div class="club-jump-bar"><button type="button" class="btn club-jump" data-club-jump>Request a Physio QR<span aria-hidden="true"> ↓</span></button></div>
    </div>
  </div>
  <button type="button" class="club-pill" id="club-pill" data-club-open="physio" aria-haspopup="dialog" aria-controls="club-modal"><span class="club-pill-dot" aria-hidden="true"></span>Club partners<span class="club-pill-arrow" aria-hidden="true">→</span></button>`;
}

function clubFaqs(sport) {
  if (!clubReady(sport)) return [];
  const lower = String(sport.nav_current || '').toLowerCase();
  const club = sport.club_nudge;
  const wallWhere = club.wall_where || 'on the wall or the court glass';
  return [
    {
      q: `How does the ${lower} club partnership work?`,
      a: `There are two tiers. Tier 1 (physio only): your club displays a co-branded QR code, anyone who books through it gets sessions with registered therapists across the province, and the club earns a 25% payout on net revenue from those bookings. Tier 2 (full recovery activation): a co-branded member store at wholesale rates, with physiotherapy built in.`,
    },
    {
      q: 'Does it take staff time or inventory?',
      a: 'It is designed to be hands-off. The sign, cards and code are made for your club, and booking and care are handled for you. Tier 1 needs no inventory. In Tier 2, orders are handled for you.',
    },
    {
      q: 'Where does the QR code go?',
      a: `Two options: a 24 by 36 inch stand-up sign at court side, or a compact co-branded sign ${wallWhere}. The code opens calmjoints.org${sport.route}.`,
    },
    {
      q: 'How do we get started?',
      a: 'Use Request a Physio QR or Request full recovery activation on this page, add your club name and email, and send. A person follows up by email. The opportunity calculator is illustrative only, not a payout guarantee.',
    },
  ];
}

function sportFaqs(sport) {
  const list = Array.isArray(sport.faq) ? sport.faq : [];
  return list.map((item) => {
    if (!String(item.q || '').trim() || !String(item.a || '').trim()) throw new Error(sport.route + ' faq needs q and a');
    return { q: item.q, a: item.a };
  });
}

function renderFaq(sport) {
  const items = sportFaqs(sport).concat(clubFaqs(sport));
  if (!items.length || !Array.isArray(sport.faq)) return '';
  const body = items.map((item, index) => (
    `<details class="faq-item"${index === 0 ? ' open' : ''}><summary>${esc(item.q)}</summary><p>${esc(item.a)}</p></details>`
  )).join('\n        ');
  return `<section class="faq" id="faq" aria-labelledby="faq-title">
    <div class="wrap">
      <h2 id="faq-title">${esc(sport.nav_current)} questions, answered</h2>
      <div class="faq-list">
        ${body}
      </div>
    </div>
  </section>`;
}

function renderJsonLd(sport, canonical, title, description) {
  const org = {
    '@type': 'Organization',
    '@id': 'https://calmjoints.org/#org',
    name: 'Calm Joints',
    legalName: 'Calm Joints Inc.',
    url: 'https://calmjoints.org/',
    logo: 'https://calmjoints.org/media/apple-touch-icon.png',
    email: 'info@calmjoints.org',
  };
  const ontario = { '@type': 'AdministrativeArea', name: 'Ontario, Canada' };
  const lower = String(sport.nav_current || '').toLowerCase();
  const graph = [
    org,
    {
      '@type': 'WebPage',
      '@id': canonical + '#webpage',
      url: canonical,
      name: title,
      description,
      inLanguage: 'en-CA',
      publisher: { '@id': org['@id'] },
      breadcrumb: { '@id': canonical + '#breadcrumb' },
      about: { '@type': 'Thing', name: sport.nav_current },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': canonical + '#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://calmjoints.org/' },
        { '@type': 'ListItem', position: 2, name: 'Racquets', item: 'https://calmjoints.org/racquets' },
        { '@type': 'ListItem', position: 3, name: sport.nav_current, item: canonical },
      ],
    },
    {
      '@type': 'Service',
      '@id': canonical + '#assessment',
      name: `Video physiotherapy assessment for ${lower} players`,
      serviceType: 'Virtual physiotherapy assessment',
      description: 'Meet a registered physiotherapist on video. They look at how you move and talk through next steps with you.',
      provider: { '@id': org['@id'] },
      areaServed: ontario,
      availableChannel: { '@type': 'ServiceChannel', serviceUrl: canonical },
    },
  ];
  if (clubReady(sport)) {
    graph.push({
      '@type': 'Service',
      '@id': canonical + '#club-partner',
      name: `${sport.nav_current} club partner program`,
      serviceType: 'Co-branded physio QR and member recovery store for private clubs',
      provider: { '@id': org['@id'] },
      areaServed: ontario,
      audience: { '@type': 'BusinessAudience', audienceType: 'Private athletic and racquet clubs' },
      url: canonical + '#club-partner',
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: 'Club partnership tiers',
        itemListElement: [
          { '@type': 'Offer', name: 'Tier 1 · Physio only', description: sport.club_nudge.tier1 },
          { '@type': 'Offer', name: 'Tier 2 · Full recovery activation', description: sport.club_nudge.tier2 },
        ],
      },
    });
  }
  const faqs = Array.isArray(sport.faq) ? sportFaqs(sport).concat(clubFaqs(sport)) : [];
  if (faqs.length) {
    graph.push({
      '@type': 'FAQPage',
      '@id': canonical + '#faq',
      mainEntity: faqs.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    });
  }
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 1)
    .replace(/</g, '\\u003c');
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

function renderSportNav(sport) {
  const links = Array.isArray(sport.sports_nav) ? sport.sports_nav : [];
  if (!links.length) return '';
  const items = links.map((item) => {
    const current = item.href === sport.route ? ' aria-current="page"' : '';
    return `<a href="${esc(item.href)}"${current}>${esc(item.label)}</a>`;
  }).join('');
  return `<nav class="sport-switch" aria-label="Racket sports">${items}</nav>`;
}

function renderSportPage(sport, catalog) {
  const widget = sport.widget || {};
  if (!/^https:\/\//.test(widget.store_url || '') || !/^https:\/\//.test(widget.nav_url || '')) {
    throw new Error(sport.route + ' needs store URLs');
  }
  if (!widget.store_cta || !widget.nav_label || !widget.public_label) {
    throw new Error(sport.route + ' needs store labels');
  }
  const cards = listedCards(catalog, sport);
  const coupon = couponReady(widget)
    ? `<p class="coupon"><span>${esc(widget.coupon.code)}</span> ${esc(widget.coupon.eligibility)}</p>`
    : '';
  const cardHtml = cards.map((item, index) => {
    const sku = item.sku;
    const width = Number(sku.image_width) || 800;
    const height = Number(sku.image_height) || 800;
    const button = sku.dest_url
      ? productButton(sku.dest_url, item.copy.cta || sku.name, sku.sku_id)
      : storeButton(widget.store_url, widget.store_cta, 'home');
    return `<li class="card">
        <div class="card-photo"><img src="${esc(sku.image_url)}" alt="${esc(sku.image_alt || sku.name)}" width="${width}" height="${height}" ${index === 0 ? 'decoding="async"' : 'loading="lazy" decoding="async"'}></div>
        <div class="card-body">
          <p class="tag">${esc(item.copy.tag)}</p>
          <h3>${esc(sku.name)}</h3>
          <p class="brand">${esc(sku.brand)}</p>
          <p class="line">${esc(item.copy.line)}</p>
          ${button}
        </div>
      </li>`;
  }).join('\n      ');
  const hintHtml = renderHints(sport, catalog, widget);
  const steps = (sport.steps || []).map((step) => (
    `<li><strong>${esc(step.title)}</strong><span>${esc(step.line)}</span></li>`
  )).join('');
  const physio = sport.physio || {};
  const canonical = 'https://calmjoints.org' + sport.route;
  const share = sport.share_image || {
    src: '/media/cj-og-1200x630.png',
    width: 1200,
    height: 630,
    alt: sport.title,
  };
  const shareUrl = 'https://calmjoints.org' + share.src;
  const pageTitle = sport.seo_title || sport.title;
  const pageDescription = sport.seo_description || sport.description;
  const shareAlt = sport.share_image ? share.alt : pageTitle;

  return `<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(pageDescription)}">
<meta name="theme-color" content="#0A1D56">
<meta name="robots" content="index,follow">
<meta name="author" content="Calm Joints">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:site_name" content="Calm Joints">
<meta property="og:title" content="${esc(pageTitle)}">
<meta property="og:description" content="${esc(pageDescription)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(shareUrl)}">
<meta property="og:image:alt" content="${esc(shareAlt)}">
<meta property="og:image:width" content="${esc(String(share.width))}">
<meta property="og:image:height" content="${esc(String(share.height))}">
<meta property="og:locale" content="en_CA">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(pageTitle)}">
<meta name="twitter:description" content="${esc(pageDescription)}">
<meta name="twitter:image" content="${esc(shareUrl)}">
<meta name="twitter:image:alt" content="${esc(shareAlt)}">
<link rel="icon" href="/media/calm-joints-mark.svg" type="image/svg+xml">
<link rel="icon" href="/media/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/media/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/calm-extras.css?v=4">
<link rel="stylesheet" href="/css/sport-zone.css?v=17">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="nav">
  <div class="wrap nav-inner">
    <a class="brand" href="/" aria-label="Calm Joints home"><img src="/media/calm-joints-wordmark.svg" alt="Calm Joints" width="154" height="42"><span class="cj-tag">In the moment recovery care</span></a>
    <nav class="nav-links" aria-label="Primary">
      <a class="nav-current" href="${esc(sport.route)}" aria-current="page">${esc(sport.nav_current)}</a>
      <a class="nav-store" href="${esc(widget.nav_url)}" data-store-place="nav">${esc(widget.nav_label)}</a>
      ${bookButton('zone-nav-book', physio.nav_button || physio.button, 'btn btn-book nav-book')}
    </nav>
  </div>
</header>
<main id="main">
  <section class="hero${sport.hero_image ? ' has-photo' : ''}">
    <div class="wrap hero-grid">
      <div class="hero-copy">
        <p class="eyebrow">${esc(sport.eyebrow)}</p>
        <h1>${esc(sport.h1)}</h1>
        <p class="sub">${esc(sport.sub)}</p>
        <div class="hero-actions">
          ${bookButton('zone-hero-book', physio.button, 'btn btn-book')}
          ${storeButton(widget.store_url, widget.store_cta, 'home')}
        </div>
        <p class="micro">${esc(sport.micro)}</p>
        ${renderSportNav(sport)}
      </div>
      ${heroFigure(sport)}
    </div>
  </section>
  ${renderTherapists(sport)}${clubReady(sport) ? '\n  ' + renderClubStrip(sport) : ''}
  ${hintHtml}
  <section class="kit" id="kit" aria-labelledby="kit-title">
    <div class="wrap">
      <div class="kit-block" id="insider-store">
        <div class="widget">
          <div class="widget-copy">
            <p class="widget-brand"><img src="/media/logos/roll-recovery.png" alt="ROLL Recovery" width="120" height="36"></p>
            <p class="widget-label">${esc(widget.public_label)}</p>
            <h2 id="kit-title">${esc(sport.kit_title)}</h2>
            <p>${esc(widget.panel_copy)}</p>
            ${coupon}
          </div>
          ${storeButton(widget.store_url, widget.store_cta, 'home')}
        </div>
        <ul class="cards">
      ${cardHtml}
        </ul>
        <p class="kit-note">${esc(sport.kit_note)}</p>
      </div>
    </div>
  </section>
  ${renderInsider(sport)}
  <section class="physio" id="assessment" aria-labelledby="physio-title">
    <div class="wrap physio-card">
      <div>
        <h2 id="physio-title">${esc(physio.heading)}</h2>
        <p>${esc(physio.body)}</p>
        <p class="micro">${esc(physio.note)}</p>
      </div>
      <div class="physio-actions">
        ${bookButton('zone-physio-book', physio.button, 'btn btn-book')}
        ${storeButton(widget.store_url, widget.store_cta, 'home')}
      </div>
    </div>
  </section>
  <section class="steps-block" aria-labelledby="steps-title">
    <div class="wrap">
      <h2 id="steps-title">${esc(sport.steps_heading)}</h2>
      <ol class="steps">${steps}</ol>
    </div>
  </section>
  ${[renderGuides(sport), renderClubNudge(sport), renderFaq(sport)].filter(Boolean).join('\n  ')}
</main>
<footer>
  <div class="wrap foot">
    <a href="/" aria-label="Calm Joints home"><img src="/media/calm-joints-wordmark.svg" alt="Calm Joints" width="120" height="33"></a>
    <p class="disclaimer">${esc(sport.disclaimer)}</p>
    <nav aria-label="Footer">
      <a href="/">Home</a>
      <a href="/team">Team</a>
      <a href="/blog">Blog</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/report">Report a poster</a>
      <a href="#cookies" data-cookie-settings>Cookie settings</a>
    </nav>
    <p class="mail"><a href="mailto:info@calmjoints.org">info@calmjoints.org</a></p>
    <p class="legal">© 2026 Calm Joints Inc.</p>
  </div>
</footer>
<div class="sticky" aria-label="${esc(sport.nav_current)} actions">
  ${bookButton('zone-sticky-book', physio.button, 'btn btn-book')}
  ${storeButton(widget.store_url, widget.store_cta, 'home')}
</div>
${[sport.hints && sport.hints.items && sport.hints.items.length ? '<script src="/js/sport-hints.js?v=1" defer></script>' : '', sport.therapists && sport.therapists.people && sport.therapists.people.length ? '<script src="/js/sport-therapists.js?v=1" defer></script>' : '', sport.insider ? '<script src="/js/sport-insider.js?v=6" defer></script>' : '', sport.club_nudge ? '<script src="/js/sport-club.js?v=3" defer></script>' : ''].filter(Boolean).join('\n')}
<script src="/config.js"></script>
<script src="/js/book.js?v=8"></script>
<script src="/js/consent.js"></script>
${renderJsonLd(sport, canonical, pageTitle, pageDescription)}
</body>
</html>
`;
}

function isPlain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeFamily(family, sport) {
  const out = JSON.parse(JSON.stringify(family || {}));
  for (const [key, value] of Object.entries(sport || {})) {
    if (isPlain(value) && isPlain(out[key])) out[key] = { ...out[key], ...value };
    else out[key] = value;
  }
  return out;
}

function renderAll(root) {
  const base = root || ROOT;
  const catalog = readJson(path.join(base, 'catalog/recovery-skus.json'));
  const dir = path.join(base, 'sports');
  const familyPath = path.join(dir, '_family.json');
  const family = fs.existsSync(familyPath) ? readJson(familyPath) : {};
  const pages = fs.readdirSync(dir).filter((name) => name.endsWith('.json') && !name.startsWith('_')).sort().map((name) => {
    const sport = mergeFamily(family, readJson(path.join(dir, name)));
    if (!sport.sport_id) throw new Error(sport.route + ' needs sport_id');
    if (sport.insider && !/^[a-z0-9-]+$/.test(sport.sport_id)) throw new Error(sport.route + ' sport_id is not a slug');
    return { file: pageName(sport.route), html: renderSportPage(sport, catalog), sport };
  });
  return { catalog, pages, family };
}

function renderRacquetsIndex(family, pages) {
  const widget = (family && family.widget) || {};
  const physio = (family && family.physio) || {};
  if (!/^https:\/\//.test(widget.store_url || '') || !/^https:\/\//.test(widget.nav_url || '')) {
    throw new Error('/racquets needs store URLs');
  }
  const byRoute = new Map((pages || []).map((page) => [page.sport.route, page.sport]));
  const nav = Array.isArray(family.sports_nav) ? family.sports_nav : [];
  const sports = nav.map((item) => byRoute.get(item.href)).filter(Boolean);
  if (sports.length !== 5) throw new Error('/racquets needs the five court sports');
  const cards = sports.map((sport, index) => {
    const img = sport.hero_image;
    if (!img || !String(img.src || '').startsWith('/media/')) throw new Error(sport.route + ' needs a hero for the racquets index');
    const focus = focusStyle(img, sport.route);
    const eager = index === 0 ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
    return `<li>
        <a class="racquet-card" href="${esc(sport.route)}">
          <img src="${esc(img.src)}" alt="${esc(img.alt)}" width="${esc(String(img.width))}" height="${esc(String(img.height))}"${focus} ${eager}>
          <span class="racquet-copy">
            <h2>${esc(sport.nav_current || sport.eyebrow)}</h2>
            <p>${esc(sport.h1)}</p>
            <p class="racquet-credit">Photo: ${esc(img.author)} / ${esc(img.source_label)} · ${esc(img.license)} · ${esc(img.changes)}</p>
          </span>
        </a>
      </li>`;
  }).join('\n      ');
  const switchLinks = nav.map((item) => {
    const current = item.href === '/racquets' ? ' aria-current="page"' : '';
    return `<a href="${esc(item.href)}"${current}>${esc(item.label)}</a>`;
  }).join('');
  const title = 'Racquets | Calm Joints';
  const description = 'Squash, tennis, pickleball, padel and badminton. A short kit for between matches, and a video assessment with a registered physiotherapist.';
  const canonical = 'https://calmjoints.org/racquets';
  const shareUrl = 'https://calmjoints.org/media/cj-og-1200x630.png';
  return `<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#0A1D56">
<meta name="robots" content="index,follow">
<meta name="author" content="Calm Joints">
<link rel="canonical" href="${canonical}">
<meta property="og:site_name" content="Calm Joints">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${shareUrl}">
<meta property="og:image:alt" content="Calm Joints">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="en_CA">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${shareUrl}">
<link rel="icon" href="/media/calm-joints-mark.svg" type="image/svg+xml">
<link rel="icon" href="/media/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/media/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/calm-extras.css?v=4">
<link rel="stylesheet" href="/css/sport-zone.css?v=17">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="nav">
  <div class="wrap nav-inner">
    <a class="brand" href="/" aria-label="Calm Joints home"><img src="/media/calm-joints-wordmark.svg" alt="Calm Joints" width="154" height="42"><span class="cj-tag">In the moment recovery care</span></a>
    <nav class="nav-links" aria-label="Primary">
      <a class="nav-current" href="/racquets" aria-current="page">Racquets</a>
      <a class="nav-store" href="${esc(widget.nav_url)}" data-store-place="nav">${esc(widget.nav_label)}</a>
      ${bookButton('zone-nav-book', physio.nav_button || physio.button, 'btn btn-book nav-book')}
    </nav>
  </div>
</header>
<main id="main">
  <section class="hero">
    <div class="wrap hero-grid">
      <div class="hero-copy">
        <p class="eyebrow">Racquets</p>
        <h1>Five court sports.</h1>
        <p class="sub">Squash, tennis, pickleball, padel and badminton. Each page has a short kit for between matches, and a video assessment with a registered physiotherapist if you’d like to talk through how you move.</p>
        <div class="hero-actions">
          ${bookButton('zone-hero-book', physio.button, 'btn btn-book')}
          ${storeButton(widget.store_url, widget.store_cta, 'home')}
        </div>
        <p class="micro">${esc(family.micro || '')}</p>
        <nav class="sport-switch" aria-label="Racket sports">${switchLinks}</nav>
      </div>
    </div>
  </section>
  <section class="racquet-index" aria-labelledby="racquets-title">
    <div class="wrap">
      <h2 id="racquets-title">Pick a court.</h2>
      <ul class="racquet-grid">
      ${cards}
      </ul>
    </div>
  </section>
</main>
<footer>
  <div class="wrap foot">
    <a href="/" aria-label="Calm Joints home"><img src="/media/calm-joints-wordmark.svg" alt="Calm Joints" width="120" height="33"></a>
    <p class="disclaimer">${esc(family.disclaimer || '')}</p>
    <nav aria-label="Footer">
      <a href="/">Home</a>
      <a href="/team">Team</a>
      <a href="/blog">Blog</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/report">Report a poster</a>
      <a href="#cookies" data-cookie-settings>Cookie settings</a>
    </nav>
    <p class="mail"><a href="mailto:info@calmjoints.org">info@calmjoints.org</a></p>
    <p class="legal">© 2026 Calm Joints Inc.</p>
  </div>
</footer>
<div class="sticky" aria-label="Racquets actions">
  ${bookButton('zone-sticky-book', physio.button, 'btn btn-book')}
  ${storeButton(widget.store_url, widget.store_cta, 'home')}
</div>
<script src="/config.js"></script>
<script src="/js/book.js?v=8"></script>
<script src="/js/consent.js"></script>
</body>
</html>
`;
}

module.exports = {
  renderSportPage,
  renderAll,
  renderRacquetsIndex,
  mergeFamily,
  listedCards,
  couponReady,
  pageName,
  heroFigure,
  esc,
};
