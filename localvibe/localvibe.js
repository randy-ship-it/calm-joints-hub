/*
 * Local Consumer Vibe: shared page logic. Brand-neutral: every brand detail comes from window.LOCALVIBE_THEME.
 * Trusted places are NOT in this file or any public file. The page asks /api/localvibe?pc=<FSA>, which returns at most 3 nearby places.
 * Also loads in Node for tests: module.exports exposes the pure helpers.
 */
(function (root) {
  'use strict';

  /* ---------- pure helpers (tested in scripts/test-localvibe.js) ---------- */
  var PC_RE = /^[ABCEGHJ-NPRSTVXY]\d[A-Z]\s?(\d[A-Z]\d)?$/i;
  function normalizePostal(v) {
    v = String(v || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (v.length !== 3 && v.length !== 6) return null;
    var s = v.length === 6 ? v.slice(0, 3) + ' ' + v.slice(3) : v;
    return PC_RE.test(s) ? { fsa: v.slice(0, 3), full: s } : null;
  }
  function isOntarioFsa(fsa) { return /^[KLMNP]/.test(fsa); }
  function haversine(aLat, aLng, bLat, bLng) {
    var R = 6371, p = Math.PI / 180;
    var x = Math.pow(Math.sin((bLat - aLat) * p / 2), 2) + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.pow(Math.sin((bLng - aLng) * p / 2), 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function within(locs, lat, lng, maxKm) {
    return locs.map(function (l) { return Object.assign({}, l, { km: haversine(lat, lng, l.lat, l.lng) }); })
      .filter(function (l) { return l.km <= maxKm; }).sort(function (a, b) { return a.km - b.km; });
  }
  // Deterministic 0..1 from a string (FNV-1a, then one mulberry32 step).
  function rand01(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h = (h + 0x6D2B79F5) | 0;
    var t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // Share of the day's activity by hour (local time): quiet at night, busy in the evening.
  var TOD = [0.22, 0.16, 0.12, 0.1, 0.12, 0.2, 0.38, 0.55, 0.7, 0.8, 0.85, 0.9, 0.95, 0.9, 0.85, 0.85, 0.9, 0.95, 1, 1, 0.95, 0.8, 0.55, 0.35];
  // Area profile from the estimator's own numbers: people per km2 within 10 km (dense city core ... small town).
  function areaProfile(pop10) {
    var dens = pop10 > 0 ? pop10 / (Math.PI * 100) : 900;
    var u = Math.max(0, Math.min(1, (Math.log(dens) / Math.LN10 - 2.2) / 1.7));   // 0 = quiet/low density, 1 = dense core
    return { dens: dens, u: u };
  }
  var CAT_FIT = {
    'Recovery tools': function (u) { return 0.75 + 0.6 * u; },
    'Yoga & mobility': function (u) { return 0.7 + 0.7 * u; },
    'Wearables & tracking': function (u) { return 0.7 + 0.7 * u; },
    'Sleep & heat': function (u) { return 0.8 + 0.4 * u; },
    'Supplements': function (u) { return 0.85 + 0.3 * u; },
    'Pregnancy & postpartum': function (u) { return 0.7 + 0.7 * (1 - Math.abs(2 * u - 1)); },
    'Everyday pain relief': function (u) { return 0.8 + 0.45 * (1 - u); },
    'Foot & lower-body support': function (u) { return 0.65 + 0.9 * (1 - u); }
  };
  // Score each brand for an area key (the FSA). Same area and same 3-hour block gives the same ranking.
  // The area profile and a per-area taste factor move brands up or down, so different postal codes tell different stories.
  function rankBrands(brands, key, opts) {
    opts = opts || {};
    var u = typeof opts.u === 'number' ? opts.u : 0.5, block = typeof opts.block === 'number' ? opts.block : 0;
    var scored = brands.map(function (b) {
      var fit = (CAT_FIT[b.cat] || function () { return 1; })(u);
      var taste = 0.45 + 1.1 * rand01(key + '|' + b.slug);                 // this area's own taste
      var drift = 0.9 + 0.2 * rand01(key + '|' + b.slug + '|b' + block);   // slow change through the day
      return { brand: b, score: Math.pow(b.baseWeight, 0.7) * fit * taste * drift };
    }).sort(function (a, b) { return b.score - a.score; });
    var total = scored.reduce(function (s, y) { return s + y.score; }, 0);
    return scored.map(function (x, i) { return { brand: x.brand, share: x.score / total, rank: i + 1 }; });
  }
  function dayKey(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  // People who looked at a brand in a given hour. hourly = recovery views per hour in the area, from the estimator.
  function hourValue(key, slug, share, hourly, capture, day, hour) {
    var j = 0.85 + 0.3 * rand01(key + '|' + slug + '|' + day + '|' + hour);
    return Math.max(1, hourly * capture * share * TOD[((hour % 24) + 24) % 24] * j);
  }
  function lastHour(key, slug, share, hourly, capture, now) {
    var d = new Date(now), day = dayKey(d), h = d.getHours(), f = d.getMinutes() / 60;
    var a = hourValue(key, slug, share, hourly, capture, day, h - 1), b = hourValue(key, slug, share, hourly, capture, day, h);
    return Math.max(1, Math.round(a + (b - a) * f));
  }
  function series(key, slug, share, hourly, capture, now, n) {
    var d = new Date(now), day = dayKey(d), h = d.getHours(), out = [];
    for (var i = n - 1; i >= 0; i--) out.push(hourValue(key, slug, share, hourly, capture, day, h - i));
    return out;
  }
  function today(key, slug, share, hourly, capture, now) {
    var d = new Date(now), day = dayKey(d), s = 0;
    for (var h = 0; h <= d.getHours(); h++) s += hourValue(key, slug, share, hourly, capture, day, h);
    return Math.round(s);
  }
  function hubHref(T, slug) {
    var m = (T.hubSlugMap && T.hubSlugMap[slug]) || slug;
    return (T.hubPath || '/hub/') + m + '?utm_source=' + encodeURIComponent(T.id || 'site') + '&utm_medium=local-vibe&utm_campaign=' + encodeURIComponent(slug);
  }

  var api = { normalizePostal: normalizePostal, isOntarioFsa: isOntarioFsa, haversine: haversine, within: within, rand01: rand01, rankBrands: rankBrands, areaProfile: areaProfile, lastHour: lastHour, series: series, today: today, hubHref: hubHref, TOD: TOD };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  if (!root.document) return;

  /* ---------- page ---------- */
  var T = root.LOCALVIBE_THEME || {};
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var safeUrl = function (u) { return /^https?:\/\//i.test(u || '') ? u : ''; };
  var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var base = T.assetBase || '/localvibe/';
  var state = { est: null, views20: 600000, brands: [], map: null, layer: null, key: 'ON', hourly: 0, center: null, radius: 20, places: [], label: '', pins: [] };

  function applySkin() {
    var logo = $('[data-lv=logo]');
    if (logo && T.logo) { logo.src = T.logo.src; logo.alt = T.logo.alt || ''; logo.width = T.logo.width; logo.height = T.logo.height; }
    $$('[data-lv=home]').forEach(function (a) { a.href = T.homeUrl || '/'; });
    $$('[data-lv=brandname]').forEach(function (a) { a.textContent = T.brandName || ''; a.href = T.homeUrl || '/'; });
    $$('[data-lv-cta]').forEach(function (a) {
      var c = T.ctas && T.ctas[a.dataset.lvCta];
      if (!c) { a.hidden = true; return; }
      a.textContent = c.label; a.href = c.href;
      if (/^https?:/.test(c.href) && c.href.indexOf(location.host) < 0) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      Object.keys(c.attrs || {}).forEach(function (k) { a.setAttribute(k, c.attrs[k]); });
    });
    var copy = T.copy || {};
    $$('[data-lv]').forEach(function (e) { if (copy[e.dataset.lv]) e.textContent = copy[e.dataset.lv]; });
    document.title = 'Local Consumer Vibe | ' + (T.brandName || '');
  }
  function loadExtraScripts() {
    (T.extraScripts || []).reduce(function (p, src) {
      return p.then(function () { return new Promise(function (res) { var s = document.createElement('script'); s.src = src; s.onload = s.onerror = res; document.body.appendChild(s); }); });
    }, Promise.resolve());
  }

  /* ---------- illustrative pins ---------- */
  var ICONS = {
    yoga: '<circle cx="12" cy="5.5" r="2"/><path d="M12 8v5.5M5.5 10.5L12 12l6.5-1.5M8 20l4-6.5 4 6.5"/>',
    dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
    cross: '<path d="M12 5v14M5 12h14"/>',
    leaf: '<path d="M5 19c0-8 5-13.5 14-14.5 0 9-5 14.5-13 14.5M5 19c3-4.5 6-7.5 10-9.5"/>',
    heart: '<path d="M12 19.5s-7-4.2-7-9.4a3.9 3.9 0 0 1 7-2.3 3.9 3.9 0 0 1 7 2.3c0 5.2-7 9.4-7 9.4z"/>'
  };
  function iconKey(type) {
    var t = String(type || '').toLowerCase();
    if (/pilates|yoga|barre|stretch|mobility|flex/.test(t)) return 'yoga';
    if (/gym|fitness|strength|crossfit|train|boot|weight|cycl|spin|run|box|climb/.test(t)) return 'dumbbell';
    if (/physio|chiro|clinic|health|osteo|rehab|medical|therap|massage|rmt|sport/.test(t)) return 'cross';
    if (/spa|sauna|cold|float|well|recover|contrast|salon|cryo/.test(t)) return 'leaf';
    return 'heart';
  }
  function iconSvg(type, cls) {
    return '<svg class="' + (cls || 'lv-ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[iconKey(type)] + '</svg>';
  }
  function pinIcon(l, near) {
    var html = '<div class="lv-mk' + (near ? ' is-near' : '') + (l.approx ? ' is-approx' : '') + '" style="--d:' + (180 + (l.n - 1) * 170) + 'ms">' +
      '<span class="lv-mk-halo"></span>' +
      '<svg viewBox="0 0 40 52" width="40" height="52" aria-hidden="true"><path class="lv-mk-body" d="M20 50.5S3.5 32.5 3.5 19.5a16.5 16.5 0 0 1 33 0c0 13-16.5 31-16.5 31z"/><circle cx="20" cy="19.5" r="11.5" fill="#fff"/>' +
      '<g transform="translate(9.4 8.9) scale(.88)" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">' + ICONS[iconKey(l.type)] + '</g></svg>' +
      '<b>' + l.n + '</b></div>';
    return L.divIcon({ className: 'lv-pin', html: html, iconSize: [40, 52], iconAnchor: [20, 50], popupAnchor: [0, -46] });
  }

  /* ---------- map: soft light tiles, built straight away so the page opens on a map ---------- */
  var ONTARIO = [[42.6, -82.4], [46.2, -76.6]];
  function overlayPad() {
    var f = $('#lv-float'), w = root.innerWidth;
    if (!f) return { tl: [20, 20], br: [20, 20] };
    var r = f.getBoundingClientRect(), s = $('#lv-map').getBoundingClientRect();
    if (w > 860) return { tl: [Math.round(r.right - s.left) + 28, 24], br: [24, 24] };
    return { tl: [16, Math.round(r.bottom - s.top) + 14], br: [16, 64] };
  }
  function ensureMap() {
    if (state.map) return state.map;
    var touch = !!(root.L && L.Browser && L.Browser.mobile);
    var m = L.map('lv-map', { zoomControl: false, scrollWheelZoom: false, dragging: !touch, tap: false, attributionControl: false, zoomSnap: 0.25 });
    L.control.zoom({ position: 'topright' }).addTo(m);
    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(m);
    // Soft, quiet base map (Esri light grey + its label layer), tinted green by CSS. A skin can swap it with theme.mapTiles
    // (for example a keyed MapTiler or Stadia style). If the tiles cannot load, fall back to OpenStreetMap, muted by CSS.
    var tiles = T.mapTiles || {
      layers: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
      ],
      maxZoom: 16,
      attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors'
    };
    var fell = false, group = L.layerGroup();
    tiles.layers.forEach(function (u, i) {
      var tl = L.tileLayer(u, { maxZoom: tiles.maxZoom || 18, attribution: i === 0 ? tiles.attribution : '' });
      tl.on('tileerror', function () {
        if (fell) return; fell = true; m.removeLayer(group); m.getContainer().classList.add('is-osm');
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(m);
      });
      group.addLayer(tl);
    });
    group.addTo(m);
    m.setMaxZoom(tiles.maxZoom || 18);
    state.map = m; state.layer = L.layerGroup().addTo(m);
    var p = overlayPad();
    m.fitBounds(ONTARIO, { paddingTopLeft: p.tl, paddingBottomRight: p.br, animate: false });
    return m;
  }
  function popupHtml(l) {
    var u = safeUrl(l.website);
    var name = u ? '<a class="lv-pop-name" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(l.name) + '</a>' : '<b class="lv-pop-name">' + esc(l.name) + '</b>';
    return '<div class="lv-pop">' + name + '<span>' + esc(l.type) + (l.city ? ' · ' + esc(l.city) : '') + ' · ' + l.km.toFixed(1) + ' km</span>' +
      (l.approx ? '<small>Pin is placed at the postal area for now.</small>' : '') +
      (u ? '<a class="lv-pop-go" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">Visit website</a>' : '') + '</div>';
  }
  function ringLabel(c, km) {
    var lat = c[0] + km / 111.32;
    return L.marker([lat, c[1]], { icon: L.divIcon({ className: 'lv-ringlbl', html: '<span>' + km + ' km</span>', iconSize: [48, 20], iconAnchor: [24, 10] }), interactive: false, keyboard: false });
  }
  function drawMap(list, r, fit) {
    var m = ensureMap(), c = state.center;
    state.layer.clearLayers(); state.pins = [];
    var is20 = r === 20;
    L.circle(c, { radius: 20000, color: '#15803D', weight: 1.5, opacity: is20 ? 0.7 : 0.3, dashArray: '2 7', lineCap: 'round', fillColor: '#15A34A', fillOpacity: is20 ? 0.07 : 0.03, interactive: false }).addTo(state.layer);
    L.circle(c, { radius: 10000, color: '#15803D', weight: 2, opacity: is20 ? 0.5 : 0.85, fillColor: '#15A34A', fillOpacity: is20 ? 0.09 : 0.15, interactive: false }).addTo(state.layer);
    ringLabel(c, 10).addTo(state.layer); ringLabel(c, 20).addTo(state.layer);
    L.marker(c, { icon: L.divIcon({ className: 'lv-you', html: '<i></i><b>You</b>', iconSize: [20, 20], iconAnchor: [10, 10] }), interactive: false, keyboard: false, zIndexOffset: -100 }).addTo(state.layer);
    list.forEach(function (l, i) {
      var mk = L.marker([l.lat, l.lng], { icon: pinIcon(l, i === 0), title: l.name, keyboard: true, riseOnHover: true }).addTo(state.layer).bindPopup(popupHtml(l), { className: 'lv-popup', closeButton: false, autoPanPadding: [24, 90] });
      state.pins.push(mk);
    });
    setTimeout(function () {
      m.invalidateSize();
      if (fit) {
        var p = overlayPad();
        var b = L.latLng(c[0], c[1]).toBounds(r * 2000);
        m.fitBounds(b, { paddingTopLeft: p.tl, paddingBottomRight: p.br, animate: !reduce, duration: 0.8 });
      }
    }, 40);
  }

  /* ---------- nearby cards: only the (at most 3) places the lookup returned ---------- */
  function renderList(items) {
    var ul = $('#lv-list');
    ul.innerHTML = items.map(function (l, i) {
      var u = safeUrl(l.website);
      var head = u ? '<a class="lv-pc-name" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(l.name) + '</a>' : '<span class="lv-pc-name">' + esc(l.name) + '</span>';
      var tags = (i === 0 ? '<span class="lv-tag lv-tag-near">Closest</span>' : '') + (l.status === 'new' ? '<span class="lv-tag lv-tag-new">New</span>' : '') + (l.approx ? '<span class="lv-tag">Approx. location</span>' : '');
      var act = u ? '<a class="lv-btn lv-btn-soft" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">Visit website<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg></a>' : '<button type="button" class="lv-btn lv-btn-soft" data-show>Show on map</button>';
      return '<li class="lv-pc" data-i="' + i + '" style="--i:' + i + '"><div class="lv-pc-top"><span class="lv-pc-ic">' + iconSvg(l.type) + '<b>' + l.n + '</b></span>' +
        '<div class="lv-pc-main">' + head + '<span class="lv-pc-sub">' + esc(l.type) + (l.city ? ' · ' + esc(l.city) : '') + '</span></div>' +
        '<span class="lv-km">' + l.km.toFixed(1) + '<small> km</small></span></div>' +
        '<div class="lv-pc-tags">' + tags + '</div>' + act + '</li>';
    }).join('');
    $$('#lv-list .lv-pc').forEach(function (li) {
      li.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        var p = state.pins[+li.dataset.i]; if (!p || !state.map) return;
        $('.lv-stage').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        state.map.setView(p.getLatLng(), Math.max(state.map.getZoom(), 13), { animate: !reduce }); p.openPopup();
      });
    });
  }

  /* ---------- brands: swipeable cards + a slow ribbon ---------- */
  var tickTimer = null;
  function logoHtml(b, small) {
    return b.logo ? '<img src="' + esc(b.logo) + '" alt="" loading="lazy" decoding="async">' : '<span class="lv-wordmark">' + esc(b.name) + '</span>';
  }
  function brandCard(r, i, key, hourly, cap, now) {
    var b = r.brand, n = lastHour(key, b.slug, r.share, hourly, cap, now), td = today(key, b.slug, r.share, hourly, cap, now);
    var s = series(key, b.slug, r.share, hourly, cap, now, 12), mx = Math.max.apply(null, s);
    var bars = s.map(function (v) { return '<i style="height:' + Math.max(16, Math.round(v / mx * 100)) + '%"></i>'; }).join('');
    return '<li class="lv-bc"><a class="lv-brand" href="' + esc(hubHref(T, b.slug)) + '" data-slug="' + esc(b.slug) + '" aria-label="' + esc(b.name) + ', about ' + n + ' people looked in the last hour (estimated). Open the ' + esc(b.name) + ' hub.">' +
      '<span class="lv-bc-top"><span class="lv-rank">#' + (i + 1) + '</span><span class="lv-dot" style="--o:' + (i * 0.7).toFixed(1) + 's" aria-hidden="true"></span></span>' +
      '<span class="lv-logo-chip">' + logoHtml(b) + '</span>' +
      '<span class="lv-bn"><b>' + esc(b.name) + '</b><span class="lv-bs">about <em>' + n + '</em> looked in the last hour</span><span class="lv-bt">about ' + td + ' today · estimate</span></span>' +
      '<span class="lv-spark" aria-hidden="true">' + bars + '</span></a></li>';
  }
  function pill(b, i, dup) {
    return '<a class="lv-pill" href="' + esc(hubHref(T, b.slug)) + '" aria-label="' + esc(b.name) + ' hub"' + (dup ? ' tabindex="-1" aria-hidden="true"' : '') + '><span class="lv-dot" style="--o:' + ((i * 0.9) % 4).toFixed(1) + 's" aria-hidden="true"></span><span class="lv-pill-logo">' + logoHtml(b) + '</span></a>';
  }
  function renderBrands() {
    var now = Date.now(), cap = T.networkCapture || 0.03, key = state.key, hourly = state.hourly;
    var e10 = state.est && state.est[10], prof = areaProfile(e10 ? e10.pop : 0);
    var ranked = rankBrands(state.brands, key, { u: prof.u, block: Math.floor(new Date(now).getHours() / 3) });
    var top = ranked.slice(0, 6), rest = ranked.slice(6);
    renderCats(ranked);
    $('#lv-area').textContent = state.label || 'you';
    $('#lv-brands').innerHTML = top.map(function (r, i) { return brandCard(r, i, key, hourly, cap, now); }).join('');
    var rb = $('#lv-ribbon');
    if (rest.length) {
      var pills = function (dup) { return rest.map(function (r, i) { return pill(r.brand, i, dup); }).join(''); };
      var set = function (dup) { return pills(dup) + pills(true); };
      rb.innerHTML = '<div class="lv-ribbon-in"><div class="lv-ribbon-set">' + set(false) + '</div><div class="lv-ribbon-set" aria-hidden="true">' + set(true) + '</div></div>';
      rb.hidden = false;
    } else rb.hidden = true;
    syncRail();
    startTicks();
  }
  function syncRail() {
    var rail = $('#lv-brands'), p = $('#lv-prev'), n = $('#lv-next');
    if (!rail || !p) return;
    p.disabled = rail.scrollLeft < 8;
    n.disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 8;
  }
  // Quiet "live" feel: every 6 to 10 seconds one card nudges up by one and softly highlights. Still, when motion is reduced.
  function startTicks() {
    clearTimeout(tickTimer);
    if (reduce) return;
    (function next() {
      tickTimer = setTimeout(function () {
        var cards = $$('#lv-brands .lv-brand');
        if (document.hidden || !cards.length) return next();
        var c = cards[Math.floor(Math.random() * cards.length)], em = $('em', c);
        em.textContent = (+em.textContent || 0) + 1;
        c.classList.remove('is-ping'); void c.offsetWidth; c.classList.add('is-ping');
        next();
      }, 6000 + Math.random() * 4000);
    })();
  }

  /* ---------- area numbers and category mix (estimates) ---------- */
  function fmt(n) { return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(Math.round(n)); }
  function areaEst(r) {
    var e = state.est && state.est[r];
    if (e) return e;
    var f = Math.pow(r / 20, 1.7);   // fallback if the lookup did not send per-radius numbers
    return { views: state.views20 * f, pop: state.views20 / 0.81 * f };
  }
  function renderStats(r) {
    var e = areaEst(r), n = state.places.filter(function (l) { return l.km <= r; }).length;
    $('#lv-stat-k').textContent = 'Within ' + r + ' km of ' + state.label;
    $('#lv-views').textContent = '~' + fmt(e.views);
    $('#lv-pop').textContent = fmt(e.pop); $('#lv-pop-r').textContent = r;
    $('#lv-near-n').textContent = n;
    $('#lv-stats').hidden = false;
  }
  function renderCats(ranked) {
    var sums = {}, order = [];
    ranked.forEach(function (x) { var c = x.brand.cat; if (!c) return; if (!(c in sums)) { sums[c] = 0; order.push(c); } sums[c] += x.share; });
    var top = order.sort(function (a, b) { return sums[b] - sums[a]; }).slice(0, 4), mx = sums[top[0]] || 1;
    $('#lv-cats').innerHTML = top.length ? '<p class="lv-cats-h">Likely to be shopped for here <span>estimated mix</span></p>' + top.map(function (c, i) {
      return '<div class="lv-cat"><span>' + esc(c) + '</span><i style="--w:' + Math.round(sums[c] / mx * 100) + '%;--i:' + i + '"></i><b>~' + Math.round(sums[c] * 100) + '%</b></div>';
    }).join('') : '';
  }

  /* ---------- distance chips ---------- */
  function setRadius(r, fit) {
    state.radius = r;
    $$('.lv-chip').forEach(function (c) { c.setAttribute('aria-pressed', String(+c.dataset.r === r)); });
    var list = state.places.filter(function (l) { return l.km <= r; });
    drawMap(list, r, fit);
    renderList(list);
    $('#lv-listtitle').textContent = 'Within ' + r + ' km of ' + state.label;
    renderStats(r);
    $('#lv-offers-area').textContent = state.label;
    $('#lv-sum').textContent = list.length ? list.length + (list.length === 1 ? ' trusted place' : ' trusted places') + ' close by. Tap a card to find it on the map.' : 'No trusted places within ' + r + ' km of ' + state.label + '. Try 20 km.';
    $('#lv-soon').hidden = false;
    $$('.lv-chip').forEach(function (ch) {
      var n = state.places.filter(function (l) { return l.km <= +ch.dataset.r; }).length;
      ch.textContent = ch.dataset.r + ' km · ' + n;
    });
  }

  /* ---------- search ---------- */
  function say(t, bad) { var m = $('#lv-msg'); m.textContent = t || ''; m.classList.toggle('is-bad', !!bad); }
  function showArea(d) {
    state.center = [d.point.lat, d.point.lng]; state.key = d.fsa; state.label = d.fsa; state.hourly = d.views20 / 30 / 24; state.est = d.est || null; state.views20 = d.views20 || 600000;
    state.places = (d.places || []).slice(0, 3);
    var fb = $('#lv-fallback'), ctl = $('#lv-ctl'), stage = $('.lv-stage');
    $('#lv-prompt').hidden = true;
    stage.classList.add('is-results'); $('#lv-float').classList.add('is-compact');
    if (!state.places.length) {
      ctl.hidden = true; fb.hidden = false; $('#lv-list').innerHTML = ''; $('#lv-sum').textContent = ''; $('#lv-soon').hidden = true;
      $('#lv-listtitle').textContent = 'Near ' + d.fsa;
      $('#lv-fallback-title').textContent = d.ontario ? 'No trusted places near ' + d.fsa + ' yet' : 'We’re expanding';
      $('#lv-fallback-text').textContent = (T.copy && T.copy.expanding) || 'We are expanding.';
      drawMap([], 20, true); renderStats(20); $('#lv-offers-area').textContent = d.fsa;
    } else {
      fb.hidden = true; ctl.hidden = false;
      setRadius(state.places.some(function (l) { return l.km <= 10; }) ? 10 : 20, true);
    }
    renderBrands();
  }
  function lookup(raw) {
    var pc = normalizePostal(raw);
    if (!pc) { say('Enter a Canadian postal code, like M5V or M5V 2T6.', true); return; }
    say('Looking up ' + pc.fsa + '…');
    var url = (T.lookupUrl || '/api/localvibe') + '?pc=' + encodeURIComponent(pc.fsa);
    fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) { var e = new Error('lookup'); e.status = r.status; throw e; } return r.json(); })
      .then(function (d) { onResult(d); })
      .catch(function (e) { onError(e); });
  }
  function onResult(d) {
    say('Showing ' + d.fsa + '. Distances are approximate.');
    try { history.replaceState(null, '', '?pc=' + d.fsa); } catch (e) {}
    showArea(d);
    var s = $('.lv-stage').getBoundingClientRect();
    if (s.top < -20 || s.top > 200) $('.lv-stage').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
  function onError(e) {
    var s = e && e.status;
    say(s === 404 ? 'We could not find that postal code. Check it and try again.' : s === 429 ? 'That was a lot of lookups. Please wait a minute and try again.' : 'We could not look that up right now. Please try again.', true);
  }

  /* ---------- "local offers" alert sign-up: email only, no login, express consent box ---------- */
  function initNotify() {
    var f = $('#lv-nform'), N = T.notify;
    if (!f) return;
    if (!N || !N.url) { $('#lv-offers .lv-notify').hidden = true; return; }
    var st = $('#lv-nstatus'), em = $('#lv-nemail'), btn = $('button', f);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = em.value.trim(); st.className = 'lv-nstatus';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { st.textContent = 'That email does not look quite right. Try once more?'; st.classList.add('is-bad'); em.focus(); return; }
      if (!$('#lv-nconsent').checked) { st.textContent = 'Tick the box so we know it is OK to email you.'; st.classList.add('is-bad'); return; }
      btn.disabled = true; st.textContent = 'One sec…';
      var page = location.pathname + (state.label && state.label !== '' && state.key !== 'ON' ? '?pc=' + state.key : '');
      fetch(N.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: v, src: N.src, placement: N.placement || 'inline', consent: true, page: page, company: f.company.value }) })
        .then(function (r) { if (!r.ok) throw new Error(); f.classList.add('is-done'); st.textContent = 'You are on the list. We will email you when offers open near ' + (state.label || 'you') + '.'; st.classList.add('is-ok'); })
        .catch(function () { st.textContent = 'We could not save that just now. Please try again in a moment.'; st.classList.add('is-bad'); })
        .then(function () { btn.disabled = false; });
    });
  }

  function init(brands) {
    initNotify();
    state.brands = brands;
    $$('.lv-chip').forEach(function (c) { c.addEventListener('click', function () { setRadius(+c.dataset.r, true); }); });
    $('#lv-form').addEventListener('submit', function (e) { e.preventDefault(); lookup($('#lv-pc').value); });
    var rail = $('#lv-brands');
    rail.addEventListener('scroll', function () { root.requestAnimationFrame(syncRail); }, { passive: true });
    $('#lv-prev').addEventListener('click', function () { rail.scrollBy({ left: -rail.clientWidth * 0.8, behavior: reduce ? 'auto' : 'smooth' }); });
    $('#lv-next').addEventListener('click', function () { rail.scrollBy({ left: rail.clientWidth * 0.8, behavior: reduce ? 'auto' : 'smooth' }); });
    root.addEventListener('resize', syncRail);
    state.key = 'ON'; state.hourly = 2200000 / 30 / 24; state.label = '';
    $('#lv-area').textContent = 'you (Ontario)';
    renderBrands();
    var q = new URLSearchParams(location.search).get('pc');
    if (q) { $('#lv-pc').value = q; lookup(q); }
  }

  applySkin();
  ensureMap();
  fetch(base + 'brands.json').then(function (r) { return r.json(); })
    .then(function (b) { init(b); loadExtraScripts(); })
    .catch(function () { say('Something went wrong loading the page. Please refresh.', true); loadExtraScripts(); });
})(typeof window !== 'undefined' ? window : globalThis);
