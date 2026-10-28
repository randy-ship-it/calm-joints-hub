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
  // Score each brand for an area key (the FSA). Same key, same ranking, every time.
  function rankBrands(brands, key) {
    var scored = brands.map(function (b) { return { brand: b, score: b.baseWeight * (0.8 + 0.4 * rand01(key + '|' + b.slug)) }; })
      .sort(function (a, b) { return b.score - a.score; });
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

  var api = { normalizePostal: normalizePostal, isOntarioFsa: isOntarioFsa, haversine: haversine, within: within, rand01: rand01, rankBrands: rankBrands, lastHour: lastHour, series: series, today: today, hubHref: hubHref, TOD: TOD };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  if (!root.document) return;

  /* ---------- page ---------- */
  var T = root.LOCALVIBE_THEME || {};
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var base = T.assetBase || '/localvibe/';
  var state = { brands: [], map: null, layer: null, key: 'ON', hourly: 0, center: null, radius: 20, places: [], label: '', pins: [] };

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

  /* map: created only once there is an area to show */
  function ensureMap() {
    if (state.map) return state.map;
    var m = L.map('lv-map', { zoomControl: true, scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(m);
    state.map = m; state.layer = L.layerGroup().addTo(m);
    return m;
  }
  function popupHtml(l) {
    var name = l.website ? '<a class="lv-pop-name" href="' + esc(l.website) + '" target="_blank" rel="noopener noreferrer">' + esc(l.name) + '</a>' : '<b class="lv-pop-name">' + esc(l.name) + '</b>';
    return '<div class="lv-pop">' + name + '<span>' + esc(l.type) + (l.city ? ' · ' + esc(l.city) : '') + ' · ' + l.km.toFixed(1) + ' km</span>' +
      (l.approx ? '<small>Pin is placed at the postal area for now.</small>' : '') +
      (l.website ? '<a class="lv-pop-go" href="' + esc(l.website) + '" target="_blank" rel="noopener noreferrer">Visit website</a>' : '') + '</div>';
  }
  function drawMap(list, r, fit) {
    var m = ensureMap(), c = state.center;
    state.layer.clearLayers(); state.pins = [];
    L.circle(c, { radius: 20000, color: '#15803D', weight: 1.5, opacity: r === 20 ? 0.8 : 0.35, dashArray: '6 6', fillColor: '#15803D', fillOpacity: r === 20 ? 0.05 : 0.02, interactive: false }).addTo(state.layer);
    L.circle(c, { radius: 10000, color: '#15803D', weight: 2.5, opacity: r === 10 ? 0.95 : 0.55, fillColor: '#15803D', fillOpacity: r === 10 ? 0.1 : 0.05, interactive: false }).addTo(state.layer);
    L.marker(c, { icon: L.divIcon({ className: 'lv-you', html: '<i></i><b>You</b>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, keyboard: false }).addTo(state.layer);
    list.forEach(function (l) {
      var mk = L.marker([l.lat, l.lng], { icon: L.divIcon({ className: 'lv-pin' + (l.approx ? ' is-approx' : ''), html: '<i>' + l.n + '</i>', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -14] }), title: l.name, keyboard: true }).addTo(state.layer).bindPopup(popupHtml(l));
      state.pins.push(mk);
    });
    setTimeout(function () {
      m.invalidateSize();
      if (fit) m.fitBounds(L.latLngBounds(list.map(function (l) { return [l.lat, l.lng]; }).concat([c])).pad(0.25), { maxZoom: 14 });
    }, 40);
  }

  /* list: only the (at most 3) places the lookup returned */
  function renderList(items) {
    var ul = $('#lv-list');
    ul.innerHTML = items.map(function (l, i) {
      var head = l.website ? '<a class="lv-row-name" href="' + esc(l.website) + '" target="_blank" rel="noopener noreferrer">' + esc(l.name) + '<span class="lv-ext" aria-hidden="true"> ↗</span></a>' : '<span class="lv-row-name">' + esc(l.name) + '</span>';
      var tags = (l.status === 'new' ? '<span class="lv-tag lv-tag-new">New</span>' : '') + (l.approx ? '<span class="lv-tag">Approx. location</span>' : '');
      return '<li data-i="' + i + '"><span class="lv-num">' + l.n + '</span><div class="lv-row-main">' + head + '<span class="lv-row-sub">' + esc(l.type) + (l.city ? ' · ' + esc(l.city) : '') + '</span>' + tags + '</div>' +
        '<span class="lv-km">' + l.km.toFixed(1) + '<small> km</small></span></li>';
    }).join('');
    $$('#lv-list li').forEach(function (li) {
      li.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        var p = state.pins[+li.dataset.i]; if (!p) return;
        setTab('map'); state.map.setView(p.getLatLng(), Math.max(state.map.getZoom(), 14)); p.openPopup();
      });
    });
  }

  /* brand strip */
  var tickTimer = null;
  function brandCard(r, i, key, hourly, cap, now) {
    var b = r.brand, n = lastHour(key, b.slug, r.share, hourly, cap, now), td = today(key, b.slug, r.share, hourly, cap, now);
    var s = series(key, b.slug, r.share, hourly, cap, now, 12), mx = Math.max.apply(null, s);
    var bars = s.map(function (v) { return '<i style="height:' + Math.max(14, Math.round(v / mx * 100)) + '%"></i>'; }).join('');
    var logo = b.logo ? '<img src="' + esc(b.logo) + '" alt="" loading="lazy" decoding="async">' : '<span class="lv-wordmark">' + esc(b.name) + '</span>';
    return '<li><a class="lv-brand" href="' + esc(hubHref(T, b.slug)) + '" data-slug="' + esc(b.slug) + '" aria-label="' + esc(b.name) + ', about ' + n + ' people looked in the last hour (estimated). Open the ' + esc(b.name) + ' hub.">' +
      '<span class="lv-rank">' + (i + 1) + '</span><span class="lv-logo-chip">' + logo + '</span>' +
      '<span class="lv-bn"><b>' + esc(b.name) + '</b><span class="lv-bs">about <em>' + n + '</em> looked in the last hour</span><span class="lv-bt">about ' + td + ' today · Estimated</span></span>' +
      '<span class="lv-spark" aria-hidden="true">' + bars + '</span></a></li>';
  }
  function renderBrands() {
    var now = Date.now(), cap = T.networkCapture || 0.03, key = state.key, hourly = state.hourly;
    var ranked = rankBrands(state.brands, key);
    var top = ranked.slice(0, 5), rest = ranked.slice(5, 8);
    $('#lv-area').textContent = state.label || 'you';
    $('#lv-brands').innerHTML = top.map(function (r, i) { return brandCard(r, i, key, hourly, cap, now); }).join('');
    $('#lv-also').innerHTML = rest.length ? 'Also getting looks: ' + rest.map(function (r) { return '<a href="' + esc(hubHref(T, r.brand.slug)) + '">' + esc(r.brand.name) + '</a>'; }).join(', ') : '';
    startTicks();
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

  /* tabs and distance chips */
  function setTab(which) {
    $('#lv-grid').dataset.tab = which;
    $('#lv-tab-map').setAttribute('aria-selected', which === 'map');
    $('#lv-tab-list').setAttribute('aria-selected', which === 'list');
    if (which === 'map' && state.map) setTimeout(function () { state.map.invalidateSize(); }, 30);
  }
  function setRadius(r, fit) {
    state.radius = r;
    $$('.lv-chip').forEach(function (c) { c.setAttribute('aria-pressed', String(+c.dataset.r === r)); });
    var list = state.places.filter(function (l) { return l.km <= r; });
    drawMap(list.length ? list : state.places, r, fit);
    renderList(list);
    $('#lv-listtitle').textContent = 'Trusted within ' + r + ' km';
    $('#lv-sum').textContent = list.length ? list.length + (list.length === 1 ? ' trusted place' : ' trusted places') + ' within ' + r + ' km of ' + state.label : 'No trusted places within ' + r + ' km of ' + state.label + '. Try 20 km.';
    $$('.lv-chip').forEach(function (ch) {
      var n = state.places.filter(function (l) { return l.km <= +ch.dataset.r; }).length;
      ch.textContent = ch.dataset.r + ' km (' + n + ')';
    });
  }

  /* search */
  function say(t, bad) { var m = $('#lv-msg'); m.textContent = t || ''; m.classList.toggle('is-bad', !!bad); }
  function showArea(d) {
    state.center = [d.point.lat, d.point.lng]; state.key = d.fsa; state.label = d.fsa; state.hourly = d.views20 / 30 / 24;
    state.places = d.places || [];
    var grid = $('#lv-grid'), fb = $('#lv-fallback'), tabs = $('.lv-tabs'), ctl = $('#lv-ctl');
    $('#lv-prompt').hidden = true;
    if (!state.places.length) {
      grid.hidden = true; tabs.hidden = true; ctl.hidden = true; fb.hidden = false;
      $('#lv-fallback-title').textContent = d.ontario ? 'No trusted places near ' + d.fsa + ' yet' : 'We’re expanding';
      $('#lv-fallback-text').textContent = (T.copy && T.copy.expanding) || 'We are expanding.';
    } else {
      fb.hidden = true; grid.hidden = false; tabs.hidden = false; ctl.hidden = false;
      setTab(grid.dataset.tab || 'map');
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
    say('Showing the ' + d.fsa + ' area. Places are placed by postal area, so distances are approximate.');
    try { history.replaceState(null, '', '?pc=' + d.fsa); } catch (e) {}
    showArea(d);
    $('#lv-results').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
  function onError(e) {
    var s = e && e.status;
    say(s === 404 ? 'We could not find that postal code. Check it and try again.' : s === 429 ? 'That was a lot of lookups. Please wait a minute and try again.' : 'We could not look that up right now. Please try again.', true);
  }

  function init(brands) {
    state.brands = brands;
    $$('.lv-chip').forEach(function (c) { c.addEventListener('click', function () { setRadius(+c.dataset.r, true); }); });
    $('#lv-tab-map').addEventListener('click', function () { setTab('map'); });
    $('#lv-tab-list').addEventListener('click', function () { setTab('list'); });
    $('#lv-form').addEventListener('submit', function (e) { e.preventDefault(); lookup($('#lv-pc').value); });
    $('#lv-grid').dataset.tab = 'map';
    state.key = 'ON'; state.hourly = 2200000 / 30 / 24; state.label = '';
    $('#lv-area').textContent = 'you (Ontario)';
    renderBrands();
    var q = new URLSearchParams(location.search).get('pc');
    if (q) { $('#lv-pc').value = q; lookup(q); }
  }

  applySkin();
  fetch(base + 'brands.json').then(function (r) { return r.json(); })
    .then(function (b) { init(b); loadExtraScripts(); })
    .catch(function () { say('Something went wrong loading the page. Please refresh.', true); loadExtraScripts(); });
})(typeof window !== 'undefined' ? window : globalThis);
