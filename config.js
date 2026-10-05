/**
 * Calm Joints hub — runtime config.
 * Booking goes straight to the CHI Calm Joints location on Jane (no partner popup).
 */
window.CALM_JOINTS = {
  brand: {
    name: 'Calm Joints',
    owner: 'Clairvoyant Holdings Inc. (CHI)',
    contact: 'info@calmjoints.org',
  },
  booking: {
    primaryUrl: 'https://calmjoints.janeapp.com/locations/calm-joints/book#/list',
    embedUrl: null,
    providerListApi: null,
    status: 'jane-chi',
    label: 'Book a physiotherapist',
  },
  theme: {
    primary: '#15A34A',
    primaryHover: '#15803D',
    darkest: '#042414',
    dark: '#0B1D16',
    mint: '#D3F8DF',
    surface: '#EDFAF4',
    paper: '#FFFFFF',
  },
};
