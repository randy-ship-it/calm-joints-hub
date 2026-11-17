(function () {
  'use strict';
  var T = window.CJTraining;
  if (!T) return;
  var page = document.body && document.body.getAttribute('data-training');

  function $(id) { return document.getElementById(id); }
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function show(id, on) { var n = $(id); if (n) n.hidden = !on; }
  function setSteps(names, current) {
    var list = $('steps');
    if (!list) return;
    clear(list);
    names.forEach(function (name, i) {
      var item = el('li', i === current ? 'on' : (i < current ? 'done' : ''), name);
      if (i === current) item.setAttribute('aria-current', 'step');
      list.appendChild(item);
    });
  }

  function bookPage() {
    var state = { step: 0, serviceId: '', clinicianId: '', ymd: '', hour: null };
    var stepNames = ['Visit type', 'Physiotherapist', 'Time', 'Your details', 'Done'];
    var today = T.torontoYmd(new Date());
    var days = T.upcomingDays(T.addDaysYmd(today, 1), 8);

    function paint() {
      setSteps(stepNames, state.step);
      ['step-service', 'step-clinician', 'step-time', 'step-details', 'step-done'].forEach(function (id, i) {
        show(id, state.step === i);
      });
      if (state.step === 1) paintStaff();
      if (state.step === 2) paintTimes();
    }

    function paintStaff() {
      var root = $('staff');
      clear(root);
      T.CLINICIANS.forEach(function (c) {
        var btn = el('button', 'pick staff-card');
        btn.type = 'button';
        btn.setAttribute('aria-pressed', c.id === state.clinicianId ? 'true' : 'false');
        if (c.photo) {
          var img = document.createElement('img');
          img.src = c.photo;
          img.alt = '';
          btn.appendChild(img);
        } else {
          btn.appendChild(el('span', 'avatar', c.initials));
        }
        var wrap = el('span');
        wrap.appendChild(el('b', '', (c.goesBy ? c.goesBy + ' · ' : '') + c.name));
        wrap.appendChild(el('span', 'meta', c.cred + ' · training profile, not a live calendar'));
        btn.appendChild(wrap);
        btn.addEventListener('click', function () {
          state.clinicianId = c.id;
          state.ymd = '';
          state.hour = null;
          paintStaff();
        });
        root.appendChild(btn);
      });
    }

    function paintTimes() {
      var dayRoot = $('days');
      var slotRoot = $('slots');
      var empty = $('no-slots');
      clear(dayRoot);
      clear(slotRoot);
      if (!state.ymd) state.ymd = days[0];
      days.forEach(function (ymd) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-pressed', ymd === state.ymd ? 'true' : 'false');
        var parts = T.formatYmdLabel(ymd).split(' ');
        btn.appendChild(el('small', '', parts[0]));
        btn.appendChild(document.createTextNode(parts.slice(1).join(' ')));
        btn.addEventListener('click', function () {
          state.ymd = ymd;
          state.hour = null;
          paintTimes();
        });
        dayRoot.appendChild(btn);
      });
      var slots = T.slotsFor(state.clinicianId, state.ymd);
      empty.hidden = slots.length > 0;
      slots.forEach(function (slot) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = slot.label;
        btn.setAttribute('aria-pressed', slot.hour === state.hour ? 'true' : 'false');
        btn.addEventListener('click', function () {
          state.hour = slot.hour;
          paintTimes();
        });
        slotRoot.appendChild(btn);
      });
    }

    document.querySelectorAll('[data-service]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.serviceId = btn.getAttribute('data-service');
        document.querySelectorAll('[data-service]').forEach(function (other) {
          other.setAttribute('aria-pressed', other === btn ? 'true' : 'false');
        });
      });
    });

    $('next-service').addEventListener('click', function () {
      if (!state.serviceId) { $('service-err').hidden = false; return; }
      $('service-err').hidden = true;
      state.step = 1;
      paint();
    });
    $('next-clinician').addEventListener('click', function () {
      if (!state.clinicianId) { $('clinician-err').hidden = false; return; }
      $('clinician-err').hidden = true;
      state.step = 2;
      paint();
    });
    $('back-clinician').addEventListener('click', function () { state.step = 0; paint(); });
    $('next-time').addEventListener('click', function () {
      if (!state.ymd || state.hour == null) { $('time-err').hidden = false; return; }
      $('time-err').hidden = true;
      var service = T.findById(T.SERVICES, state.serviceId);
      var clinician = T.findById(T.CLINICIANS, state.clinicianId);
      $('review').textContent = service.name + ' with ' + clinician.name + ' on ' + T.formatYmdLabel(state.ymd) + ' at ' + T.formatSlot(state.hour) + ' (America/Toronto).';
      state.step = 3;
      paint();
    });
    $('back-time').addEventListener('click', function () { state.step = 1; paint(); });
    $('back-details').addEventListener('click', function () { state.step = 2; paint(); });
    $('book-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var result = T.bookTrainingVisit({
        serviceId: state.serviceId,
        clinicianId: state.clinicianId,
        ymd: state.ymd,
        hour: state.hour,
        firstName: $('first').value,
        lastName: $('last').value,
        email: $('email').value,
        phone: $('phone').value,
      });
      var err = $('details-err');
      if (!result.ok) { err.hidden = false; err.textContent = result.error; return; }
      err.hidden = true;
      $('confirm-id').textContent = result.id;
      $('confirm-summary').textContent = result.when + '. ' + result.service.name + ' with ' + result.clinician.name + '.';
      state.step = 4;
      paint();
    });
    $('book-another').addEventListener('click', function () {
      state = { step: 0, serviceId: '', clinicianId: '', ymd: '', hour: null };
      document.querySelectorAll('[data-service]').forEach(function (btn) { btn.setAttribute('aria-pressed', 'false'); });
      $('book-form').reset();
      paint();
    });
    paint();
  }

  function storePage() {
    var cart = {};

    function lines() {
      return Object.keys(cart).filter(function (id) { return cart[id] > 0; }).map(function (id) {
        return { id: id, qty: cart[id] };
      });
    }

    function paintCatalog() {
      var root = $('catalog');
      clear(root);
      T.PRODUCTS.forEach(function (product) {
        var card = el('article', 'card product');
        var img = document.createElement('img');
        img.src = product.image;
        img.alt = product.alt;
        card.appendChild(img);
        var body = el('div', 'body');
        body.appendChild(el('div', 'brand', product.brand));
        body.appendChild(el('b', '', product.name));
        body.appendChild(el('div', 'price', product.price_label));
        card.appendChild(body);
        var btn = el('button', 'btn', 'Add to training cart');
        btn.type = 'button';
        btn.addEventListener('click', function () {
          cart[product.id] = (cart[product.id] || 0) + 1;
          paintCart();
        });
        card.appendChild(btn);
        root.appendChild(card);
      });
    }

    function paintCart() {
      var root = $('cart-lines');
      var empty = $('cart-empty');
      var checkout = $('go-checkout');
      var totals = $('cart-totals');
      clear(root);
      var items = lines();
      empty.hidden = items.length > 0;
      checkout.disabled = items.length === 0;
      items.forEach(function (line) {
        var product = T.findById(T.PRODUCTS, line.id);
        var row = el('div', 'cart-line');
        row.appendChild(el('div', '', product.name));
        var qty = el('div', 'qty');
        var minus = document.createElement('button');
        minus.type = 'button';
        minus.setAttribute('aria-label', 'Remove one ' + product.name);
        minus.textContent = '−';
        minus.addEventListener('click', function () {
          cart[line.id] = Math.max(0, (cart[line.id] || 0) - 1);
          paintCart();
        });
        var plus = document.createElement('button');
        plus.type = 'button';
        plus.setAttribute('aria-label', 'Add one ' + product.name);
        plus.textContent = '+';
        plus.addEventListener('click', function () {
          cart[line.id] = (cart[line.id] || 0) + 1;
          paintCart();
        });
        qty.appendChild(minus);
        qty.appendChild(document.createTextNode(String(line.qty)));
        qty.appendChild(plus);
        row.appendChild(qty);
        row.appendChild(el('div', '', product.price_label));
        root.appendChild(row);
      });
      var sum = T.cartTotals(items);
      var bits = [];
      if (sum.usd) bits.push(T.money(sum.usd, 'USD') + ' USD');
      if (sum.cad) bits.push(T.money(sum.cad, 'CAD') + ' CAD');
      totals.textContent = bits.length ? 'Training display total: ' + bits.join(' + ') + '. Mixed currencies stay separate. Nothing will be charged.' : '';
    }

    function showPanel(name) {
      show('shop-panel', name === 'shop');
      show('checkout-panel', name === 'checkout');
      show('done-panel', name === 'done');
    }

    $('go-checkout').addEventListener('click', function () {
      if (!lines().length) return;
      showPanel('checkout');
      $('card').focus();
    });
    $('back-shop').addEventListener('click', function () { showPanel('shop'); });
    $('card').addEventListener('input', function () {
      $('card').value = T.formatCard($('card').value);
    });
    $('pay-form').addEventListener('submit', function (event) {
      event.preventDefault();
      if (!T.emailOk($('ship-email').value)) {
        $('pay-err').hidden = false;
        $('pay-err').textContent = 'Enter an email so you can practise the form. Nothing is sent.';
        return;
      }
      if (!T.phoneOk($('ship-phone').value)) {
        $('pay-err').hidden = false;
        $('pay-err').textContent = 'Enter a phone number with at least 10 digits. Nothing is sent.';
        return;
      }
      var result = T.payTrainingOrder({
        card: $('card').value,
        month: $('exp-month').value,
        year: $('exp-year').value,
        cvc: $('cvc').value,
      });
      var err = $('pay-err');
      if (!result.ok) { err.hidden = false; err.textContent = result.error; return; }
      err.hidden = true;
      $('order-id').textContent = result.id;
      var names = lines().map(function (line) {
        var product = T.findById(T.PRODUCTS, line.id);
        return line.qty + ' × ' + product.name;
      }).join(', ');
      $('order-summary').textContent = names;
      $('card').value = '';
      $('cvc').value = '';
      showPanel('done');
    });
    $('shop-again').addEventListener('click', function () {
      cart = {};
      $('pay-form').reset();
      paintCart();
      showPanel('shop');
    });
    paintCatalog();
    paintCart();
    showPanel('shop');
  }

  if (page === 'book') bookPage();
  if (page === 'store') storePage();
})();
