/**
 * Calm Joints hub — runtime config.
 * Booking goes straight to the Calm Joints booking page.
 */
window.CALM_JOINTS = {
  brand: {
    name: 'Calm Joints',
    contact: 'info@calmjoints.org',
  },
  booking: {
    primaryUrl: 'https://calmjoints.janeapp.com/locations/calm-joints/book#/discipline/2/treatment/346',
    embedUrl: null,
    providerListApi: null,
    status: 'partner-clinic',
    label: 'Book a physiotherapist',
    calendarUrl: '/book',
    // Display prices confirmed by Randy 2026-11-28 9:22 AM ET (America/Toronto).
    // Jane's public calendar may still show a different amount at checkout until that calendar is updated.
    services: {
      initial: { id: 346, name: 'Physio appointment', minutes: 60, price: 129 },
      followup: { id: 347, name: 'Physio appointment', minutes: 30, price: 129 },
    },
  },
  // $89 confirmed 2026-11-28. Partner name and booking URL are still open. Do not name the partner on the page.
  md: {
    enabled: true,
    price: 89,
    priceVerified: true,
    label: 'Doctor visit',
    primaryUrl: null,
    coverageNote: 'Private virtual visit. OHIP or benefits coverage has not been confirmed.',
  },
  guide: {
    // ElevenLabs Agents: Calm Joints Guide (chat + voice). Public agent ids, no secret.
    // agentId = the default guide (Glen). /chat shows a picker for the guides below.
    agentId: 'agent_8401m48tn2g5ehwsa0p84e8pnaf8',
    defaultGuide: 'glen',
    guides: {
      glen: { name: 'Glen', agentId: 'agent_8401m48tn2g5ehwsa0p84e8pnaf8', avatar: '/media/cj-guide-glen.webp', alt: 'Glen, Calm Joints’ virtual guide (illustration)' },
      gwen: { name: 'Gwen', agentId: 'agent_8701m49rk5stf07avtka9ef8nvs0', avatar: '/media/cj-guide-gwen.webp', alt: 'Gwen, Calm Joints’ virtual guide (illustration)' },
    },
    // Old links keep working: ?guide=randy -> Glen, ?guide=emma -> Gwen.
    aliases: { randy: 'glen', emma: 'gwen' },
    // One-tap share (js/share.js). Shares are tracked as src=share.
    shareUrl: 'https://calmjoints.org/chat?src=share',
    // "Text Glen": SMS chat with the Glen guide (Canadian numbers; api/sms). Remove to hide the line.
    sms: { number: '+16476926575', label: '(647) 692-6575', name: 'Glen' },
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
