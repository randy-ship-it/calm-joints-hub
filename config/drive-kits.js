'use strict';
// Rideshare kit costs. Customer price is not these numbers.
// price = (print_cost + ship_cost + Stripe fee + HST handling) × margin,
// then rounded up to the next $X.99. See lib/drive-pricing.js.
//
// print_cost and ship_cost are planning estimates in CAD, not a printer invoice.
// Replace them when a real quote lands. Exterior ship_cost is the extra postage
// on top of the in-car parcel, because the add-on rides in the same box.

module.exports = {
  currency: 'cad',
  margin: 1.10,
  stripe_rate: 0.029,
  stripe_fixed: 0.30,
  // Allowance for Ontario HST on the print + ship cost. This is not Stripe Tax.
  hst_rate: 0.13,
  rules_note: "Check your rideshare platform's rules before applying exterior decals.",
  bylaw_note: 'Side decals and the rear windshield only. Rear side windows stay clear for an Uber or Lyft emblem and bike stickers (Toronto bylaw).',
  kits: {
    incar: {
      id: 'incar',
      name: 'Rideshare in-car kit',
      detail: '2 headrest-back QR cards (they fit the back of the front seats) and 1 seat-pocket or console card.',
      print_cost: 12.50,
      ship_cost: 8.00,
      pieces: [
        {
          id: 'headrest',
          name: 'Headrest card',
          width_in: 8,
          height_in: 10,
          copies: 2,
          qr_in: 5.2,
          printful_env: 'PRINTFUL_VARIANT_HEADREST',
          printful_fit: 'Printful 8×10 in poster (the card that slides into a headrest sleeve)',
        },
        {
          id: 'pocket',
          name: 'Seat-pocket card',
          width_in: 4,
          height_in: 6,
          copies: 1,
          qr_in: 2.6,
          printful_env: 'PRINTFUL_VARIANT_POCKET',
          printful_fit: 'Printful 4×6 in postcard',
        },
      ],
    },
    exterior: {
      id: 'exterior',
      addon: true,
      name: 'Exterior decal add-on',
      detail: '2 small side decals and 1 rear-windshield decal.',
      print_cost: 8.40,
      ship_cost: 2.75,
      pieces: [
        {
          id: 'side',
          name: 'Side decal',
          width_in: 5,
          height_in: 5,
          copies: 2,
          qr_in: 3.2,
          qr_min_in: 3,
          printful_env: 'PRINTFUL_VARIANT_SIDE',
          printful_fit: 'Printful 5×5 in kiss-cut vinyl sticker (catalog tops out at 5×5 in)',
        },
        {
          id: 'rear',
          name: 'Rear windshield decal',
          width_in: 5,
          height_in: 5,
          copies: 1,
          qr_in: 3.2,
          qr_min_in: 3,
          printful_env: 'PRINTFUL_VARIANT_REAR',
          printful_fit: 'Printful 5×5 in kiss-cut vinyl sticker, placed on the rear windshield only',
        },
      ],
    },
  },
};
