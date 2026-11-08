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
        <div class="hero-frame">
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
      ? ` <a href="${esc(dest.href)}"${dest.attrs}>${esc(item.link)}</a>`
      : '';
    return `<li><p>${esc(item.text)}${link}</p></li>`;
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
  const strip = (sport.strip || []).map((item) => (
    `<li><strong>${esc(item.title)}</strong><span>${esc(item.line)}</span></li>`
  )).join('');
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

  return `<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(sport.title)}</title>
<meta name="description" content="${esc(sport.description)}">
<meta name="theme-color" content="#0A1D56">
<meta name="robots" content="index,follow">
<meta name="author" content="Calm Joints">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:site_name" content="Calm Joints">
<meta property="og:title" content="${esc(sport.title)}">
<meta property="og:description" content="${esc(sport.description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="https://calmjoints.org/media/cj-og-1200x630.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="en_CA">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(sport.title)}">
<meta name="twitter:description" content="${esc(sport.description)}">
<meta name="twitter:image" content="https://calmjoints.org/media/cj-og-1200x630.png">
<link rel="icon" href="/media/calm-joints-mark.svg" type="image/svg+xml">
<link rel="icon" href="/media/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/media/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/calm-extras.css?v=4">
<link rel="stylesheet" href="/css/sport-zone.css?v=6">
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
      </div>
      ${heroFigure(sport)}
    </div>
  </section>
  ${renderTherapists(sport)}
  <section class="strip" aria-label="${esc(sport.strip_label)}">
    <div class="wrap">
      <h2>${esc(sport.strip_label)}</h2>
      <ul>${strip}</ul>
    </div>
  </section>
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
<div class="sticky" aria-label="Squash actions">
  ${bookButton('zone-sticky-book', physio.button, 'btn btn-book')}
  ${storeButton(widget.store_url, widget.store_cta, 'home')}
</div>
${sport.hints && sport.hints.items && sport.hints.items.length ? '<script src="/js/sport-hints.js?v=1" defer></script>' : ''}
${sport.therapists && sport.therapists.people && sport.therapists.people.length ? '<script src="/js/sport-therapists.js?v=1" defer></script>' : ''}
<script src="/config.js"></script>
<script src="/js/book.js?v=8"></script>
<script src="/js/consent.js"></script>
</body>
</html>
`;
}

function renderAll(root) {
  const base = root || ROOT;
  const catalog = readJson(path.join(base, 'catalog/recovery-skus.json'));
  const dir = path.join(base, 'sports');
  const pages = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort().map((name) => {
    const sport = readJson(path.join(dir, name));
    return { file: pageName(sport.route), html: renderSportPage(sport, catalog), sport };
  });
  return { catalog, pages };
}

module.exports = {
  renderSportPage,
  renderAll,
  listedCards,
  couponReady,
  pageName,
  heroFigure,
  esc,
};
