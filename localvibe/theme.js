/*
 * Local Consumer Vibe: SKIN for Calm Joints.
 * The page (index.html, localvibe.css, localvibe.js, data/*.json) is shared. Only this file changes per brand.
 * To skin for another brand, copy a file from skins/ over theme.js (or point index.html at it).
 */
window.LOCALVIBE_THEME = {
  id: 'calmjoints',
  brandName: 'Calm Joints',
  homeUrl: '/',
  logo: { src: '/media/calm-joints-wordmark.svg', width: 154, height: 36, alt: 'Calm Joints' },
  favicon: '/media/calm-joints-mark.svg',
  colors: { primary: '#15803D', primaryDark: '#116A32', accent: '#15A34A', ink: '#0B1D16', mute: '#4B5E54', line: '#E6ECE8', bg: '#F5F8F6', soft: '#EAF7EF' },
  fontHref: 'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap',
  fontFamily: '"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  assetBase: '/localvibe/',                    // where this folder is served from
  lookupUrl: '/api/localvibe',                 // server-side nearest-places lookup (max 3, rate limited)
  hubPath: '/hub/',                            // brand logo click goes to <hubPath><slug>
  networkCapture: 0.03,                        // guesstimate share of local recovery views seen by the brand network
  ctas: {
    // Digital booking is first. href is a working link even if scripts fail.
    book: { label: 'Book a video visit', href: 'https://calmjoints.janeapp.com/locations/calm-joints/book#/discipline/2/treatment/346', attrs: { 'data-book': '', 'data-book-direct': '' } },
    chat: { label: 'Chat with Glen or Gwen', href: '/chat', attrs: {} },
    store: { label: 'Insider’s Store', href: 'https://www.scalehealth.ca/calmjoints?src=cjsite&place=localvibe', attrs: { 'data-store-place': 'localvibe' } }
  },
  copy: {
    bookBandTitle: 'Sore or injured? See a registered physio by video.',
    bookBandText: 'Book in a few taps from home. No travel, no waiting room.',
    expanding: 'We are expanding. Trusted places near you are coming soon, and you can still book a physio by video today.'
  },
  extraScripts: ['/config.js', '/js/book.js?v=8']   // loaded after the page is drawn (booking pop-up and tracking)
};
