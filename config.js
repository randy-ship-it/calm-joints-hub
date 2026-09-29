/**
 * Calm Joints hub — runtime config.
 * Booking routes into Align physiotherapists (Jane), not a separate clinic corp.
 * CHI owns the trade name. Scale powers the hub.
 */
window.CALM_JOINTS = {
  brand: {
    name: 'Calm Joints',
    owner: 'Clairvoyant Holdings Inc. (CHI)',
    contact: 'info@calmjoints.ca',
    tradeNameNote: 'Calm Joints is a CHI trade name. Clinical care is delivered by Align physiotherapists via Scale.',
  },
  booking: {
    primaryUrl: 'https://scalehealth.janeapp.com/locations/scale-health-x-dr-ho/book#/staff_member/91/treatment/346',
    embedUrl: null,
    providerListApi: null,
    status: 'interim-jane',
    label: 'Book with an Align physiotherapist',
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
  partners: {
    scale: 'https://www.scalehealth.ca',
    alignNote: 'Care delivered by Align physiotherapists on the Scale network',
  },
  hubs: [
    { name: 'Jill Health', slug: 'jill-health', href: 'https://www.scalehealth.ca/jillhealth' },
    { name: 'Effortless Admin', slug: 'effortless-admin', href: 'https://www.scalehealth.ca/effortlessadmin' },
    { name: "DR-HO'S", slug: 'dr-ho', href: 'https://www.scalehealth.ca/dr-ho' },
    { name: 'Sole', slug: 'sole', href: 'https://www.scalehealth.ca/sole' },
    { name: 'Roll Recovery', slug: 'roll-recovery', href: 'https://www.scalehealth.ca/roll-recovery' },
  ],
};
