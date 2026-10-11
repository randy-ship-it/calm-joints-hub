'use strict';
// Sticker Mule’s public API (https://www.stickermule.com/apidocs) only reorders items
// already saved on a personal account: POST /api/orders with items[].id, addressId, and paymentId.
// It cannot upload a new artwork URL, so it cannot print a unique partner QR.
// This adapter stays disabled on purpose. It is not a fallback and it does not fake an order.

const REASON = 'Sticker Mule’s public API only reorders saved items. It cannot accept a new per-partner QR file, so it is not used for this program.';

module.exports = {
  id: 'stickermule',
  automated: false,
  fitsUniqueArtwork: false,
  reason: REASON,
  ready() { return false; },
  missing() { return []; },
  async submit() {
    return { ok: false, status: 'unavailable', error: REASON, fallback: false };
  },
};
