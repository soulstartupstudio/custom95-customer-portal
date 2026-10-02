// The Merch Audit questionnaire — the starting point of a Partner Plan: what we need to know
// about the brand, the company, the merch they have today and the moments that matter.
// Answers are sent with their question labels, so the team app (account notes, the AM's
// email) shows exactly what was asked.

export const MERCH_AUDIT = [
  {
    key: 'brand', title: 'Your brand', intro: 'The basics we design with. Logos and files go under Brand in the portal.',
    fields: [
      { key: 'guidelines', label: 'Brand guidelines', type: 'textarea', placeholder: 'A link to your brand book, or a short description' },
      { key: 'colours', label: 'Brand colours', type: 'text', placeholder: 'Names, HEX or Pantone codes' },
      { key: 'fonts', label: 'Fonts', type: 'text' },
      { key: 'style', label: 'How would you describe your brand style?', type: 'textarea', placeholder: 'E.g. minimal and premium, playful, sustainable, bold…' },
    ],
  },
  {
    key: 'company', title: 'Your company', intro: 'Who the merch is for.',
    fields: [
      { key: 'employees', label: 'Number of employees', type: 'text' },
      { key: 'offices', label: 'Offices / locations', type: 'textarea' },
      { key: 'markets', label: 'Markets / countries you operate in', type: 'text' },
      { key: 'customers', label: 'Who are your customers?', type: 'textarea' },
      { key: 'partners', label: 'Key partners', type: 'textarea' },
      { key: 'communities', label: 'Communities you are part of or build', type: 'textarea' },
    ],
  },
  {
    key: 'existing', title: 'Your merch today', intro: 'What you have and how it works now.',
    fields: [
      { key: 'suppliers', label: 'Current merch suppliers', type: 'text' },
      { key: 'products', label: 'Products you use today', type: 'textarea' },
      { key: 'stock', label: 'Current stock (what, roughly how much, where)', type: 'textarea' },
      { key: 'logistics', label: 'How are warehousing and fulfilment arranged today?', type: 'textarea' },
      { key: 'works', label: 'What works well?', type: 'textarea' },
      { key: 'doesnt', label: "What doesn't work?", type: 'textarea' },
    ],
  },
  // The moments, in Custom95's five groups. Each: which apply, then details & dates.
  {
    key: 'acquisition', title: 'Acquisition moments', intro: 'Moments where you want to turn someone into a customer.',
    fields: [
      { key: 'which', label: 'Which apply to you?', type: 'chips', options: ['Outreach', 'Events', 'Pitches', 'Meetings', 'Proposals', 'Closing'] },
      { key: 'details', label: 'Details & dates', type: 'textarea', placeholder: 'E.g. trade show in Berlin in March (±300 visitors), a gift with every signed deal…' },
    ],
  },
  {
    key: 'customer', title: 'Customer moments', intro: 'Moments within your customer relationships.',
    fields: [
      { key: 'which', label: 'Which apply to you?', type: 'chips', options: ['Onboarding', 'Launches', 'Campaigns', "QBR's", 'Milestones', 'Gifting'] },
      { key: 'details', label: 'Details & dates', type: 'textarea', placeholder: 'E.g. a welcome box for every new customer, a product launch in Q2…' },
    ],
  },
  {
    key: 'loyalty', title: 'Loyalty moments', intro: 'Moments that take a customer from customer to fan to ambassador.',
    fields: [
      { key: 'which', label: 'Which apply to you?', type: 'chips', options: ['Anniversaries', 'VIP gifting', 'Referrals', 'Surprises', 'Exclusive drops'] },
      { key: 'details', label: 'Details & dates', type: 'textarea', placeholder: 'E.g. a gift on the 1-year customer anniversary, a limited drop for top customers…' },
    ],
  },
  {
    key: 'people', title: 'People moments', intro: 'The employee lifecycle.',
    fields: [
      { key: 'which', label: 'Which apply to you?', type: 'chips', options: ['Recruitment', 'Onboarding', 'Promotion', 'Milestones', 'Celebrations', 'Team events'] },
      { key: 'details', label: 'Details & dates', type: 'textarea', placeholder: 'E.g. ±40 new hires a year, team day in June, 5-year work anniversaries…' },
    ],
  },
  {
    key: 'culture', title: 'Culture & community moments', intro: 'Moments that make people feel part of something bigger.',
    fields: [
      { key: 'which', label: 'Which apply to you?', type: 'chips', options: ['Company events', 'Communities', 'Conferences', 'Retreats', 'Sponsorships', 'Launches'] },
      { key: 'details', label: 'Details & dates', type: 'textarea', placeholder: 'E.g. yearly company retreat in September, a running community, sponsoring a local club…' },
    ],
  },
  {
    key: 'other', title: 'Anything else',
    fields: [
      { key: 'budget', label: 'Estimated yearly merch budget', type: 'text', placeholder: 'A rough range is fine' },
      { key: 'notes', label: 'Anything else we should know?', type: 'textarea' },
    ],
  },
]

// Form values → the submitted shape: only answered questions, labels included.
export function auditPayload(values) {
  return {
    sections: MERCH_AUDIT.map(s => ({
      title: s.title,
      items: s.fields.map(f => {
        const v = values?.[s.key]?.[f.key]
        const value = Array.isArray(v) ? v.join(', ') : (v || '').trim()
        return { label: f.label, value }
      }).filter(i => i.value),
    })).filter(s => s.items.length),
  }
}

// A previous submission → form values, so an update starts from what they already said.
export function valuesFromAnswers(answers) {
  const out = {}
  for (const s of MERCH_AUDIT) {
    const sec = (answers?.sections || []).find(x => x.title === s.title)
    if (!sec) continue
    out[s.key] = {}
    for (const f of s.fields) {
      const it = sec.items.find(i => i.label === f.label)
      if (!it) continue
      out[s.key][f.key] = f.type === 'chips' ? it.value.split(',').map(x => x.trim()).filter(Boolean) : it.value
    }
  }
  return out
}
