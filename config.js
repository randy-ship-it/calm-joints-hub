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
    // agentId = the default guide (Randy). /chat shows a picker for the guides below.
    agentId: 'agent_8401m48tn2g5ehwsa0p84e8pnaf8',
    defaultGuide: 'randy',
    guides: {
      randy: { name: 'Randy', agentId: 'agent_8401m48tn2g5ehwsa0p84e8pnaf8', avatar: '/media/cj-guide-avatar.webp' },
      emma: { name: 'Emma', agentId: 'agent_8701m49rk5stf07avtka9ef8nvs0', avatar: '/media/cj-guide-emma.webp' },
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
