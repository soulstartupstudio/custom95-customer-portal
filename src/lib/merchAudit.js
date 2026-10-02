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
  {
    key: 'fixed', title: 'Fixed yearly moments', intro: 'Moments that come back every year.',
    fields: [
      { key: 'which', label: 'Which apply to you?', type: 'chips', options: ['Christmas / end of year', 'Company anniversary', 'Events', 'Trade shows', 'Company days', 'Seasonal moments'] },
      { key: 'details', label: 'Details & dates', type: 'textarea', placeholder: 'E.g. trade show in March (Berlin, ±300 visitors), Christmas gift for 120 staff…' },
    ],
  },
  {
    key: 'campaigns', title: 'Campaigns & launches',
    fields: [
      { key: 'which', label: 'Coming up?', type: 'chips', options: ['Product launches', 'Campaigns', 'Rebrand', 'Openings', 'Collaborations'] },
      { key: 'details', label: 'Details & dates', type: 'textarea' },
    ],
  },
  {
    key: 'people', title: 'People moments',
    fields: [
      { key: 'which', label: 'Which do you celebrate?', type: 'chips', options: ['Employee onboarding', 'Work anniversaries', 'Team days', 'Leave / parental leave', 'Goodbye gifts'] },
      { key: 'details', label: 'Details', type: 'textarea', placeholder: 'E.g. ±40 new hires a year, team day in June…' },
    ],
  },
  {
    key: 'relationships', title: 'Relationship moments',
    fields: [
      { key: 'which', label: 'Where does merch help your relationships?', type: 'chips', options: ['Customer visits', 'Events', 'Partners', 'VIPs', 'Press', 'Prospects'] },
      { key: 'details', label: 'Details', type: 'textarea' },
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
