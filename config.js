/**
 * Calm Joints hub — runtime config.
 * Booking: for now routes through the DR-HO'S partner clinic on Jane (popup confirms first).
 */
window.CALM_JOINTS = {
  brand: {
    name: 'Calm Joints',
    owner: 'Clairvoyant Holdings Inc. (CHI)',
    contact: 'info@calmjoints.org',
  },
  booking: {
    primaryUrl: 'https://scalehealth.janeapp.com/locations/scale-health-x-dr-ho/book#/staff_member/91/treatment/346',
    embedUrl: null,
    providerListApi: null,
    status: 'partner-clinic-drho',
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
