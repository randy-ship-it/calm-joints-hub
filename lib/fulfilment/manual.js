'use strict';
// Fallback queue. Vistaprint has no public ordering API, so a person downloads the
// PDFs from /admin/decals and places that order on Vistaprint (or another shop).
// Do not invent a Vistaprint submit call. A later printer with a real API replaces this file.

module.exports = {
  id: 'manual',
  automated: false,
  role: 'fallback',
  reason: 'Vistaprint has no public ordering API. Download the artwork from /admin/decals and submit the order by hand. Printful or Cimpress can replace this once their credentials are set.',
  ready() { return true; },
  missing() { return []; },
  async submit() {
    return {
      ok: true,
      status: 'queued',
      external_id: null,
      tracking: null,
      note: 'Queued for a person to order. Vistaprint has no ordering API.',
    };
  },
};
