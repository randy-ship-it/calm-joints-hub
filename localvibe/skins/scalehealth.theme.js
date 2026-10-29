/*
 * Local Consumer Vibe: SKIN for scalehealth.ca/localvibe (DRAFT, not deployed).
 * Drop-in: copy the localvibe/ folder to the scalehealth site, then replace theme.js with this file.
 * Fill in the three TODO values before shipping. Everything else is shared with the Calm Joints page.
 */
window.LOCALVIBE_THEME = {
  id: 'scalehealth',
  brandName: 'Scale Health',
  homeUrl: '/',
  logo: { src: '/media/scale-mark.svg', width: 36, height: 36, alt: 'Scale Health' },   // TODO confirm logo asset path on scalehealth.ca
  favicon: '/media/scale-mark.svg',
  colors: { primary: '#15803D', primaryDark: '#116A32', accent: '#15A34A', ink: '#0B1D16', mute: '#4B5E54', line: '#E6ECE8', bg: '#F5F8F6', soft: '#EAF7EF' },
  fontHref: 'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap',
  fontFamily: '"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  assetBase: '/localvibe/',
  lookupUrl: '/api/localvibe',
  hubPath: '/',                                    // scalehealth.ca/<slug> IS the brand hub (use /dr-ho, /jackhealth, /jillhealth)
  hubSlugMap: { 'jack-health': 'jackhealth', 'jill-health': 'jillhealth' },
  networkCapture: 0.03,
  ctas: {
    book: { label: 'Book a video visit', href: '/book', attrs: {} },                    // TODO the Scale digital booking route
    chat: null,
    store: { label: 'Insider’s Store', href: '/calmjoints?src=localvibe', attrs: {} }  // TODO the Scale store route
  },
  copy: {
    bookBandTitle: 'Sore or injured? See a registered physio by video.',
    bookBandText: 'Book in a few taps from home. No travel, no waiting room.',
    expanding: 'We are expanding. Trusted places near you are coming soon, and you can still book a physio by video today.'
  },
  notify: null,   // TODO point at the Scale email sign-up endpoint; with null the sign-up box is hidden
  extraScripts: []
};
