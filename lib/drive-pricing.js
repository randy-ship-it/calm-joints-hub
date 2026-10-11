'use strict';
// Customer price for a drive order.
// Let C = print_cost + ship_cost + hst_handling, and fee(P) = stripe_rate × P + stripe_fixed.
// P = (C + fee(P)) × margin
// P = margin × (print + ship + stripe_fixed + hst) / (1 − margin × stripe_rate)
// Then round UP to the next amount that ends in .99 so the order still clears a positive margin
// after the fee is recalculated on the charged price.

const CONFIG = require('../config/drive-kits');

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function charmCents(rawCents) {
  const cents = Math.max(0, Math.round(rawCents));
  const rem = cents % 100;
  if (rem === 99) return cents;
  return cents + (99 - rem);
}

function selectedKits(kitIds, cfg) {
  const want = new Set(Array.isArray(kitIds) ? kitIds : []);
  const out = [cfg.kits.incar];
  if (want.has('exterior')) out.push(cfg.kits.exterior);
  return out;
}

function quote(kitIds, cfg = CONFIG) {
  const kits = selectedKits(kitIds, cfg);
  const print = round2(kits.reduce((n, k) => n + Number(k.print_cost), 0));
  const ship = round2(kits.reduce((n, k) => n + Number(k.ship_cost), 0));
  const hst = round2(cfg.hst_rate * (print + ship));
  const margin = Number(cfg.margin);
  const rate = Number(cfg.stripe_rate);
  const fixed = Number(cfg.stripe_fixed);
  const denom = 1 - margin * rate;
  if (!(denom > 0)) throw new Error('Drive price formula has no solution. Check margin and Stripe rate.');
  const raw = (margin * (print + ship + fixed + hst)) / denom;
  const price = charmCents(Math.ceil(raw * 100 - 1e-6)) / 100;
  const stripe_fee = round2(rate * price + fixed);
  const loaded = round2(print + ship + stripe_fee + hst);
  const margin_amount = round2(price - loaded);
  return {
    currency: String(cfg.currency || 'cad').toUpperCase(),
    kits: kits.map((k) => k.id),
    print_cost: print,
    ship_cost: ship,
    hst_handling: hst,
    stripe_fee,
    stripe_rate: rate,
    stripe_fixed: fixed,
    hst_rate: cfg.hst_rate,
    margin_multiplier: margin,
    loaded,
    raw: round2(raw),
    price,
    price_cents: Math.round(price * 100),
    margin_amount,
    margin_pct: loaded > 0 ? round2((margin_amount / loaded) * 100) : 0,
  };
}

function catalog(cfg = CONFIG) {
  const incar = quote(['incar'], cfg);
  const both = quote(['incar', 'exterior'], cfg);
  const addon = round2(both.price - incar.price);
  return {
    currency: incar.currency,
    rules_note: cfg.rules_note,
    bylaw_note: cfg.bylaw_note,
    incar: {
      id: 'incar',
      name: cfg.kits.incar.name,
      detail: cfg.kits.incar.detail,
      price: incar.price,
    },
    exterior: {
      id: 'exterior',
      name: cfg.kits.exterior.name,
      detail: cfg.kits.exterior.detail,
      addon: true,
      price: addon,
    },
    totals: { incar: incar.price, both: both.price },
  };
}

module.exports = { CONFIG, quote, catalog, charmCents, round2 };
