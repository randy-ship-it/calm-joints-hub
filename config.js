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
    // $29 15-min consult, credited toward the $129 full assessment ($100 more).
    // Set all three to the CHI Jane treatment URLs. While null, the popup keeps the DR-HO'S partner routing.
    offers: {
      consult: { url: null, price: 29, minutes: 15 },
      visit: { url: null, price: 99, minutes: 40 },
      assess: { url: null, price: 129 },
    },
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
