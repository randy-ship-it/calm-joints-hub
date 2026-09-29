/**
 * Calm Joints hub — runtime config.
 * Booking opens the Zoom Scheduler page (virtual physio visit).
 */
window.CALM_JOINTS = {
  brand: {
    name: 'Calm Joints',
    owner: 'Clairvoyant Holdings Inc. (CHI)',
    contact: 'info@calmjoints.org',
  },
  booking: {
    primaryUrl: 'https://scheduler.zoom.us/randy-gilling-flc541/virtual-physio',
    embedUrl: null,
    providerListApi: null,
    status: 'zoom-scheduler',
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
