/*
 * Street-team training sandbox. This file must never talk to Jane, live payments,
 * Friday tracking, or any booking, order, or KPI endpoint. Card numbers stay in the
 * browser and are not stored.
 */
(function (root) {
  'use strict';

  var TEST_CARD = '4242424242424242';

  var SERVICES = [
    {
      id: 'initial',
      name: 'Initial video assessment',
      duration: '60 minutes',
      detail: 'The public member rate is $129. This training visit is not billed and no card is asked for.',
    },
    {
      id: 'followup',
      name: 'Follow-up video visit',
      duration: '30 minutes',
      detail: 'The public member rate is $99. This training visit is not billed and no card is asked for.',
    },
  ];

  var CLINICIANS = [
    { id: 'mark', name: 'Mark Rukavina', cred: 'PT', initials: 'MR', photo: '', density: 0.9 },
    { id: 'gabby', name: 'Gabriela Rozanski', cred: 'PT', goesBy: 'Gabby', initials: 'GR', photo: '/media/team/gabriela-r.webp', density: 0.8 },
    { id: 'aleks', name: 'Aleksandra Nenadic', cred: 'PT', goesBy: 'Aleks', initials: 'AN', photo: '/media/team/aleksandra-n.webp', density: 0.75 },
    { id: 'olakunle', name: 'Olakunle Olarewaju', cred: 'PT', initials: 'OO', photo: '', density: 0.55 },
    { id: 'manny', name: 'Manpreet Nijjar', cred: 'PT', goesBy: 'Manny', initials: 'MN', photo: '', density: 0.7 },
    { id: 'ariel', name: 'Ariel Chan', cred: 'PT', initials: 'AC', photo: '', density: 0.6 },
  ];

  var PRODUCTS = [
    { id: 'roll-r8', brand: 'ROLL Recovery', name: 'R8 Deep Tissue Massage Tool', price_label: 'US$149.00', currency: 'USD', amount: 149, image: '/media/squash/wishlist/roll-r8.webp', alt: 'ROLL Recovery R8 roller in alpine white' },
    { id: 'roll-r8plus', brand: 'ROLL Recovery', name: 'R8 Plus Deep Tissue Massage Tool', price_label: 'US$179.00', currency: 'USD', amount: 179, image: '/media/squash/wishlist/roll-r8plus.webp', alt: 'ROLL Recovery R8 Plus roller in alpine white' },
    { id: 'roll-r3', brand: 'ROLL Recovery', name: 'R3 Orthopedic Foot Roller', price_label: 'US$35.00', currency: 'USD', amount: 35, image: '/media/squash/wishlist/roll-r3.webp', alt: 'ROLL Recovery R3 foot roller' },
    { id: 'roll-stretchmat', brand: 'ROLL Recovery', name: 'StretchMat', price_label: 'US$65.00', currency: 'USD', amount: 65, image: '/media/squash/wishlist/roll-stretchmat.webp', alt: 'ROLL Recovery StretchMat in black' },
    { id: 'drho-tens-pro', brand: "DR-HO'S", name: 'TENS Pro Essentials', price_label: 'CA$249.95', currency: 'CAD', amount: 249.95, image: '/media/squash/wishlist/drho-tens-pro.webp', alt: "DR-HO'S Pain Therapy System Pro unit" },
    { id: 'roll-r1', brand: 'ROLL Recovery', name: 'R1 Percussion', price_label: 'US$139.00', currency: 'USD', amount: 139, image: '/media/squash/wishlist/roll-r1.webp', alt: 'ROLL Recovery R1 percussion tool in its case' },
    { id: 'kalaya-6x-cream', brand: 'KaLaya', name: '6x Extra Strength Pain Relief Cream', price_label: 'CA$16.95', currency: 'CAD', amount: 16.95, image: '/media/squash/wishlist/kalaya-6x-cream.webp', alt: 'KaLaya 6x Extra Strength Pain Relief Cream, 120 g' },
    { id: 'kalaya-6x-massager', brand: 'KaLaya', name: '6x Extra Strength Pain Relief Massager', price_label: 'CA$17.95', currency: 'CAD', amount: 17.95, image: '/media/squash/wishlist/kalaya-6x-massager.webp', alt: 'KaLaya 6x cream bottle with a massager top' },
    { id: 'sole-active-medium', brand: 'SOLE', name: 'Active Medium footbed', price_label: 'CA$65.00', currency: 'CAD', amount: 65, image: '/media/squash/wishlist/sole-active-medium.webp', alt: 'SOLE Active Medium footbed, side view' },
  ];

  var SLOT_HOURS = [8, 9, 10, 11, 13, 14, 15, 16];

  function digits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function isTrainingCard(value) {
    return digits(value) === TEST_CARD;
  }

  function formatCard(value) {
    return digits(value).slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  }

  function expiryIsFuture(month, year, now) {
    var m = Number(month);
    var y = Number(year);
    if (!m || m < 1 || m > 12 || !y) return false;
    if (y < 100) y += 2000;
    var when = now || new Date();
    var ym = y * 12 + m;
    var nowYm = when.getFullYear() * 12 + (when.getMonth() + 1);
    return ym >= nowYm;
  }

  function cvcOk(value) {
    return /^\d{3,4}$/.test(String(value || '').trim());
  }

  function emailOk(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function phoneOk(value) {
    var n = digits(value);
    return n.length >= 10 && n.length <= 15;
  }

  function hash(text) {
    var h = 2166136261;
    var s = String(text);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function torontoYmd(date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  function addDaysYmd(ymd, days) {
    var parts = ymd.split('-').map(Number);
    var dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
    var y = dt.getUTCFullYear();
    var m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    var d = String(dt.getUTCDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function weekdayOfYmd(ymd) {
    var parts = ymd.split('-').map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
  }

  function formatYmdLabel(ymd) {
    var parts = ymd.split('-').map(Number);
    var dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return new Intl.DateTimeFormat('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(dt);
  }

  function formatSlot(hour) {
    var suffix = hour >= 12 ? 'p.m.' : 'a.m.';
    var h = hour % 12 || 12;
    return h + ':00 ' + suffix;
  }

  function upcomingDays(fromYmd, count) {
    var days = [];
    var ymd = fromYmd;
    var i = 0;
    while (days.length < count && i < 21) {
      var dow = weekdayOfYmd(ymd);
      if (dow !== 0 && dow !== 6) days.push(ymd);
      ymd = addDaysYmd(ymd, 1);
      i += 1;
    }
    return days;
  }

  function slotsFor(clinicianId, ymd) {
    var clinician = CLINICIANS.filter(function (c) { return c.id === clinicianId; })[0];
    if (!clinician) return [];
    var seed = hash(clinicianId + ':' + ymd);
    var list = [];
    for (var i = 0; i < SLOT_HOURS.length; i++) {
      var bit = (seed >> (i * 3)) & 7;
      if (bit / 7 < clinician.density) {
        list.push({ hour: SLOT_HOURS[i], label: formatSlot(SLOT_HOURS[i]) });
      }
    }
    return list;
  }

  function findById(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function confirmId(prefix) {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = prefix;
    for (var i = 0; i < 8; i++) out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    return out;
  }

  function cartTotals(lines) {
    var usd = 0;
    var cad = 0;
    (lines || []).forEach(function (line) {
      var product = findById(PRODUCTS, line.id);
      if (!product) return;
      var qty = Number(line.qty) || 0;
      if (product.currency === 'USD') usd += product.amount * qty;
      else cad += product.amount * qty;
    });
    return { usd: usd, cad: cad };
  }

  function money(amount, currency) {
    var code = currency === 'USD' ? 'USD' : 'CAD';
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: code }).format(amount);
  }

  function payTrainingOrder(input) {
    var card = input && input.card;
    var month = input && input.month;
    var year = input && input.year;
    var cvc = input && input.cvc;
    if (!isTrainingCard(card)) {
      return { ok: false, error: 'Only the training test card 4242 4242 4242 4242 is accepted. Nothing was charged.' };
    }
    if (!expiryIsFuture(month, year)) {
      return { ok: false, error: 'Use any future expiry date. Nothing was charged.' };
    }
    if (!cvcOk(cvc)) {
      return { ok: false, error: 'Enter a 3- or 4-digit CVC. Nothing was charged.' };
    }
    return {
      ok: true,
      id: confirmId('TRAIN-ORDER-'),
      charged: false,
      processor: 'none',
      note: 'Training only. No card was sent anywhere, and no real payment was taken.',
    };
  }

  function bookTrainingVisit(input) {
    var service = findById(SERVICES, input && input.serviceId);
    var clinician = findById(CLINICIANS, input && input.clinicianId);
    var slots = slotsFor(input && input.clinicianId, input && input.ymd);
    var slot = slots.filter(function (s) { return s.hour === Number(input && input.hour); })[0];
    var first = String((input && input.firstName) || '').trim();
    var last = String((input && input.lastName) || '').trim();
    if (!service) return { ok: false, error: 'Choose a visit type.' };
    if (!clinician) return { ok: false, error: 'Choose a physiotherapist.' };
    if (!slot) return { ok: false, error: 'Choose an open time.' };
    if (!first || !last) return { ok: false, error: 'Enter a first and last name.' };
    if (!emailOk(input && input.email)) return { ok: false, error: 'Enter an email so you can practise the form. Nothing is sent.' };
    if (!phoneOk(input && input.phone)) return { ok: false, error: 'Enter a phone number with at least 10 digits. Nothing is sent.' };
    return {
      ok: true,
      id: confirmId('TRAIN-VISIT-'),
      booked: false,
      service: service,
      clinician: clinician,
      when: formatYmdLabel(input.ymd) + ' at ' + slot.label + ' (America/Toronto)',
      ymd: input.ymd,
      hour: slot.hour,
      name: first + ' ' + last,
      note: 'Training only. No appointment was created, and no clinician calendar was changed.',
    };
  }

  var TRAINING = {
    TEST_CARD: TEST_CARD,
    SERVICES: SERVICES,
    CLINICIANS: CLINICIANS,
    PRODUCTS: PRODUCTS,
    digits: digits,
    isTrainingCard: isTrainingCard,
    formatCard: formatCard,
    expiryIsFuture: expiryIsFuture,
    cvcOk: cvcOk,
    emailOk: emailOk,
    phoneOk: phoneOk,
    torontoYmd: torontoYmd,
    addDaysYmd: addDaysYmd,
    upcomingDays: upcomingDays,
    slotsFor: slotsFor,
    formatSlot: formatSlot,
    formatYmdLabel: formatYmdLabel,
    findById: findById,
    cartTotals: cartTotals,
    money: money,
    payTrainingOrder: payTrainingOrder,
    bookTrainingVisit: bookTrainingVisit,
    confirmId: confirmId,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRAINING;
  root.CJTraining = TRAINING;
})(typeof window !== 'undefined' ? window : globalThis);
