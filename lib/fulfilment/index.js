'use strict';
// Printer selection. Cimpress Open wins when its four credentials exist.
// Otherwise Printful, when a token and every variant id for the order exist.
// Otherwise the manual queue. Sticker Mule is never selected.

const cimpress = require('./cimpress');
const printful = require('./printful');
const stickermule = require('./stickermule');
const manual = require('./manual');

function selectAdapter(env, order) {
  if (cimpress.ready(env)) return cimpress;
  if (printful.ready(env, order || null)) return printful;
  return manual;
}

function report(env) {
  const active = selectAdapter(env);
  const printfulMissing = printful.missing(env);
  const cimpressMissing = cimpress.missing(env);
  let automated_today = 'None. Orders wait in /admin/decals until a print API is configured.';
  if (active.id === 'cimpress') automated_today = 'Cimpress Open. Paid orders are submitted to the partner API with no manual step.';
  else if (active.id === 'printful') automated_today = 'Printful. Paid orders are created and confirmed through the Orders API with no manual step.';
  return {
    active: active.id,
    automated_today,
    cimpress: {
      id: 'cimpress',
      ready: cimpress.ready(env),
      automated: true,
      missing: cimpressMissing,
      optional: ['CIMPRESS_AUDIENCE', 'CIMPRESS_WEBHOOK_SECRET', 'CIMPRESS_VARIANT_HEADREST', 'CIMPRESS_VARIANT_POCKET', 'CIMPRESS_VARIANT_SIDE', 'CIMPRESS_VARIANT_REAR'],
    },
    printful: {
      id: 'printful',
      ready: printfulMissing.length === 0,
      automated: true,
      missing: printfulMissing,
      fits: printful.fits,
      optional: ['PRINTFUL_STORE_ID', 'PRINTFUL_PLACEMENT', 'PRINTFUL_TECHNIQUE', 'PRINTFUL_WEBHOOK_SECRET'],
    },
    stickermule: { id: 'stickermule', ready: false, automated: false, missing: [], reason: stickermule.reason },
    manual: { id: 'manual', ready: true, automated: false, role: 'fallback', reason: manual.reason },
  };
}

module.exports = { cimpress, printful, stickermule, manual, selectAdapter, report };
