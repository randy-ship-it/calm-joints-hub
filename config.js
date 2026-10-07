/**
 * Calm Joints hub — runtime config.
 * Booking goes straight to the partner clinic booking page.
 */
window.CALM_JOINTS = {
  brand: {
    name: 'Calm Joints',
    contact: 'info@calmjoints.org',
  },
  booking: {
    primaryUrl: 'https://calmjoints.janeapp.com/locations/calm-joints/book#/list',
    embedUrl: null,
    providerListApi: null,
    status: 'partner-clinic',
    label: 'Book a physiotherapist',
  },
  guide: {
    // ElevenLabs Agents: Calm Joints Guide (chat + voice). Public agent ids, no secret.
    // agentId = the default guide (Glen). /chat shows a picker for the guides below.
    agentId: 'agent_8401m48tn2g5ehwsa0p84e8pnaf8',
    defaultGuide: 'glen',
    guides: {
      glen: { name: 'Glen', agentId: 'agent_8401m48tn2g5ehwsa0p84e8pnaf8', avatar: '/media/cj-guide-glen.webp', alt: 'Glen, the Calm Joints AI guide (illustration)' },
      gwen: { name: 'Gwen', agentId: 'agent_8701m49rk5stf07avtka9ef8nvs0', avatar: '/media/cj-guide-gwen.webp', alt: 'Gwen, the Calm Joints AI guide (illustration)' },
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
