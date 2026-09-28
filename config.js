/**
 * Calm Joints hub — runtime config (Jon fills gaps).
 * Booking routes into Align physiotherapists (Jane / provider roster),
 * not a separate Calm Joints clinic corp.
 */
window.CALM_JOINTS = {
  brand: {
    name: 'Calm Joints',
    owner: 'Clairvoyant Holdings Inc. (CHI)',
    tradeNameNote: 'Calm Joints is a CHI trade name. Clinical care is delivered by Align physiotherapists via Scale.',
  },
  // PLACEHOLDER until Jon supplies Align-physio booking embed / deep link.
  // Interim: Scale Health Jane (known Align/Scale physio booking surface).
  booking: {
    primaryUrl: 'https://scalehealth.janeapp.com/locations/scale-health-x-dr-ho/book#/staff_member/91/treatment/346',
    embedUrl: null, // Jon: iframe-safe Align booking embed URL
    providerListApi: null, // Jon: Align provider roster API endpoint
    status: 'interim-jane', // flip to 'live' when Jon confirms Align URLs
    label: 'Book with an Align physiotherapist',
  },
  theme: {
    // Scale + Align green family (portalTokens / index.css SSOT)
    primary: '#15A34A',
    primaryHover: '#15803D',
    darkest: '#042414',
    dark: '#0B1D16',
    mint: '#D3F8DF',
    surface: '#EDFAF4',
    paper: '#F7F6F1',
  },
  partners: {
    scale: 'https://www.scalehealth.ca',
    alignNote: 'Care delivered by Align physiotherapists on the Scale network',
  },
};
