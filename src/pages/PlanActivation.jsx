import { useEffect, useMemo, useState } from 'react'
import { Check, X, FileText, ShieldCheck, ArrowRight, Sparkles, Clock, CreditCard, CalendarDays, Handshake } from 'lucide-react'

// Public Plan activation page — /start/<token>. No login: the token is the key.
// The customer reviews their Plan, the key agreements in plain English and (optionally)
// the full Custom95 Plan Agreement, confirms company + billing details, accepts, and
// starts the Plan. Served by the plan-activation edge function.
const FN = 'https://qhgdmdtqssjylfwetpna.supabase.co/functions/v1/plan-activation'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZ2RtZHRxc3NqeWxmd2V0cG5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTM2MjUsImV4cCI6MjA5MTIyOTYyNX0.ZcmBzF7XF5bfCHylRSzoxhFzjo9iKLfBP9gMGn--lFs'
const HEADERS = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }
const LOGO = 'https://qhgdmdtqssjylfwetpna.supabase.co/storage/v1/object/public/branding/custom95-logo.png'

const eur = (c) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: (c ?? 0) % 100 ? 2 : 0 }).format((c ?? 0) / 100)
const fmtDate = (d) => (d ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d)) : '—')
const per = (f) => ({ monthly: 'month', quarterly: 'quarter', yearly: 'year' }[f] || f)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Field({ label, required, children, hint }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-gray-700">{label}{required && <span className="text-gray-400"> *</span>}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
    </label>
  )
}
const inputCls = (bad) => `w-full rounded-xl border px-3.5 py-2.5 text-[15px] bg-white outline-none transition focus:ring-2 focus:ring-gray-900/10 ${bad ? 'border-red-300' : 'border-gray-200 focus:border-gray-400'}`

function Section({ eyebrow, title, children }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200/80 p-5 sm:p-7">
      {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400 mb-1">{eyebrow}</p>}
      {title && <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>}
      {children}
    </section>
  )
}

function Centered({ children }) {
  return (
    <div className="min-h-screen bg-[#f6f6f4] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200/80 p-8 text-center">{children}</div>
    </div>
  )
}

export default function PlanActivation({ token, preview = false }) {
  const [state, setState] = useState({ loading: true })
  const [company, setCompany] = useState({})
  const [contact, setContact] = useState({})
  const [billing, setBilling] = useState({ same_as_contact: true, name: '', email: '', phone: '' })
  const [accept, setAccept] = useState(false)
  const [authorized, setAuthorized] = useState(false)
  const [showAgreement, setShowAgreement] = useState(false)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${FN}?token=${encodeURIComponent(token)}${preview ? '&preview=1' : ''}`, { headers: HEADERS })
        const d = await res.json()
        if (!d.ok) { setState({ loading: false, error: d.error || 'not_found' }); return }
        setState({ loading: false, data: d })
        const c = d.company || {}
        setCompany({ legal_name: c.legal_name || c.name || '', chamber_of_commerce: c.chamber_of_commerce, vat_code: c.vat_code, website: c.website,
          street: c.street, house_number: c.house_number, postal_code: c.postal_code, city: c.city, country: c.country || 'Netherlands',
          po_required: !!c.po_required, po_instructions: c.po_instructions })
        setContact({ ...(d.contact || {}) })
      } catch { setState({ loading: false, error: 'network' }) }
    })()
  }, [token, preview])

  const openAgreement = () => {
    setShowAgreement(true)
    fetch(FN, { method: 'POST', headers: HEADERS, body: JSON.stringify({ action: 'agreement_opened', token, preview }) }).catch(() => {})
  }

  const missing = useMemo(() => {
    const m = []
    const need = (v, l) => { if (!String(v ?? '').trim()) m.push(l) }
    need(company.legal_name, 'legal_name'); need(company.street, 'street'); need(company.postal_code, 'postal_code')
    need(company.city, 'city'); need(company.country, 'country')
    need(contact.first_name, 'first_name'); need(contact.last_name, 'last_name'); need(contact.phone, 'phone')
    if (!EMAIL_RE.test(contact.email || '')) m.push('email')
    if (!billing.same_as_contact) { need(billing.name, 'billing_name'); if (!EMAIL_RE.test(billing.email || '')) m.push('billing_email') }
    if (company.po_required) need(company.po_instructions, 'po_instructions')
    return m
  }, [company, contact, billing])
  const bad = (k) => touched && missing.includes(k)
  const canStart = !missing.length && accept && authorized && !preview

  const start = async () => {
    setTouched(true)
    if (!canStart) {
      setError(preview ? 'Preview mode — activation is switched off.' : missing.length ? 'Please complete the highlighted fields.' : 'Please confirm both checkboxes.')
      return
    }
    setBusy(true); setError(null)
    try {
      const res = await fetch(FN, { method: 'POST', headers: HEADERS, body: JSON.stringify({ action: 'activate', token, company, contact, billing, accept, authorized }) })
      const r = await res.json()
      if (r.ok) setDone(r)
      else setError(r.error === 'expired' ? 'This activation link has expired — please contact your Account Manager.'
        : r.error === 'missing' ? `Please complete: ${(r.missing || []).join(', ')}.` : 'Something went wrong — please try again or contact your Account Manager.')
    } catch { setError('Could not reach Custom95 — please check your connection and try again.') }
    finally { setBusy(false) }
  }

  if (state.loading) return <Centered><p className="text-sm text-gray-500">Loading your Plan…</p></Centered>
  if (state.error) {
    return <Centered>
      <img src={LOGO} alt="Custom95" className="h-9 mx-auto mb-5" />
      <h1 className="text-lg font-semibold text-gray-900">This link isn't available</h1>
      <p className="text-sm text-gray-600 mt-2">It may have been replaced or withdrawn. Please contact your Custom95 Account Manager for a new link.</p>
    </Centered>
  }

  const d = state.data
  const p = d.plan
  const am = d.account_manager
  const amFirst = am?.name?.split(' ')[0]

  if (d.state === 'expired') {
    return <Centered>
      <img src={LOGO} alt="Custom95" className="h-9 mx-auto mb-5" />
      <h1 className="text-lg font-semibold text-gray-900">This Plan activation link has expired</h1>
      <p className="text-sm text-gray-600 mt-2">No problem — your Account Manager can send you a fresh one.</p>
      {am?.email && <a href={`mailto:${am.email}?subject=New Plan activation link`} className="inline-block mt-5 bg-gray-900 text-white rounded-xl px-5 py-3 text-sm font-semibold">Contact {am.name}</a>}
    </Centered>
  }

  // ── Welcome (just activated, or opened again after activating) ───────────
  if (done || d.state === 'activated') {
    const steps = [
      ['Merch Audit', 'We collect what we need to know about your brand, current merchandise and upcoming moments.'],
      ['Plan Session', 'Together we map your year and find your biggest merchandise opportunities.'],
      ['Your Merch Plan', 'We build your Merch Calendar, Core Collection and 90-Day Action Plan.'],
      ['Start executing', 'Your first projects and opportunities go into motion straight away.'],
    ]
    return (
      <div className="min-h-screen bg-[#f6f6f4] py-10 sm:py-16 px-4">
        <div className="max-w-xl mx-auto">
          <img src={LOGO} alt="Custom95" className="h-9 mb-8" />
          <div className="bg-white rounded-2xl border border-gray-200/80 p-7 sm:p-9">
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-4"><Check className="text-emerald-600" /></div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">Welcome to Custom95 🎉</h1>
            <p className="text-gray-600 mt-2">Your Plan is active. We'll now start setting up your partnership.</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400 mt-8 mb-3">What happens next</p>
            <ol className="space-y-4">
              {steps.map(([t, s], i) => (
                <li key={t} className="flex gap-3">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-gray-900 text-white text-sm font-semibold flex items-center justify-center">{i + 1}</span>
                  <div><p className="font-medium text-gray-900">{t}</p><p className="text-sm text-gray-600">{s}</p></div>
                </li>
              ))}
            </ol>
            <a href="/" className="mt-8 w-full inline-flex items-center justify-center gap-2 bg-gray-900 hover:bg-black text-white rounded-xl px-5 py-3.5 font-semibold">
              Continue to onboarding <ArrowRight size={18} />
            </a>
            <p className="text-xs text-gray-400 mt-3 text-center">
              Sign in to your portal with {done?.contact_email || 'your email'} — you'll get a one-time sign-in link. We've also emailed you a copy of your Plan Agreement.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const keyRows = [
    [Clock, 'Response time', p.response_time || '—'],
    [Handshake, 'Projects', 'Every production project is approved by you before production starts'],
    [CreditCard, 'Payment', `${eur(p.fee_cents)} / ${per(p.billing_frequency)} Plan fee · projects on ${p.payment_terms_days ?? 30} days`],
    [CalendarDays, 'Contract term', `${p.minimum_term_months ?? 12} months, then ${p.notice_period_months ?? 1} month${(p.notice_period_months ?? 1) === 1 ? '' : 's'} notice`],
  ]
  const details = [
    ['Projects', 'Before production starts you always approve the product, quantities, pricing, artwork and production details. Nothing is produced without your go-ahead.'],
    ['Lead times', 'Lead times depend on the product, production country, decoration method, quantity and shipping method. The expected delivery date is confirmed per project.'],
    ['Responsibilities', 'Custom95 manages sourcing, supplier communication, production, project coordination, quality control and logistics coordination. You approve artwork, specifications, quantities, pricing and the final production go-ahead.'],
  ]
  const agreementUnavailable = d.state === 'agreement_unavailable'

  return (
    <div className="min-h-screen bg-[#f6f6f4] pb-28 sm:pb-16">
      {preview && <div className="bg-amber-100 text-amber-900 text-center text-xs py-2 px-4">Preview — this is what your customer sees. Activation is switched off and views aren't counted.</div>}
      <header className="max-w-3xl mx-auto px-4 pt-10 sm:pt-14 pb-6">
        <img src={LOGO} alt="Custom95" className="h-9 mb-8" />
        <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight">Start your Custom95 Plan</h1>
        <p className="text-gray-600 mt-2 text-[15px]">Everything you need to start our partnership, in one place.</p>
        <p className="text-gray-400 mt-1 text-sm">No surprises — here are the key agreements for our partnership in plain English.</p>
      </header>

      <main className="max-w-3xl mx-auto px-4 space-y-4">
        {/* Your Plan */}
        <section className="rounded-2xl p-6 sm:p-8 bg-gray-900 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">Your Plan</p>
          <div className="flex flex-wrap items-end justify-between gap-4 mt-1">
            <div>
              <h2 className="text-2xl font-semibold">{p.name || 'Custom95 Plan'}</h2>
              <p className="text-gray-400 text-sm mt-0.5">for {d.company?.name}</p>
            </div>
            <p className="text-3xl font-semibold">{eur(p.fee_cents)}<span className="text-base font-normal text-gray-400"> / {per(p.billing_frequency)}</span></p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-white/10 text-sm">
            <div><p className="text-gray-400 text-xs">Starting</p><p className="font-medium">{fmtDate(p.start_date)}</p></div>
            <div><p className="text-gray-400 text-xs">Minimum term</p><p className="font-medium">{p.minimum_term_months ?? 12} months</p></div>
            <div><p className="text-gray-400 text-xs">Account Manager</p><p className="font-medium">{am?.name || '—'}</p></div>
            {p.estimated_annual_budget_cents ? <div><p className="text-gray-400 text-xs">Est. annual merch budget</p><p className="font-medium">{eur(p.estimated_annual_budget_cents)}</p></div> : null}
          </div>
        </section>

        {/* Included */}
        {p.included?.length > 0 && (
          <Section eyebrow="What's included" title="Included in your Plan">
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
              {p.included.map(x => (
                <li key={x} className="flex gap-2.5 text-[15px] text-gray-700"><Check size={18} className="text-emerald-600 shrink-0 mt-0.5" />{x}</li>
              ))}
            </ul>
          </Section>
        )}

        {/* Key agreements */}
        <Section eyebrow="Key agreements" title="How we work together">
          <div className="divide-y divide-gray-100">
            {keyRows.map(([Icon, k, v]) => (
              <div key={k} className="flex items-start gap-3 py-3 first:pt-0">
                <Icon size={18} className="text-gray-400 mt-0.5 shrink-0" />
                <p className="text-[15px] text-gray-500 w-36 shrink-0">{k}</p>
                <p className="text-[15px] text-gray-900 font-medium">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1.5">
            {details.map(([t, body]) => (
              <details key={t} className="group rounded-xl bg-gray-50 px-4 py-3">
                <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-medium text-gray-800">
                  {t}<span className="text-gray-400 group-open:rotate-45 transition text-lg leading-none">+</span>
                </summary>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">{body}</p>
              </details>
            ))}
          </div>
          {p.custom_terms && <p className="mt-4 text-sm text-gray-700 bg-amber-50/70 border border-amber-100 rounded-xl px-4 py-3"><span className="font-medium">Specific to your Plan: </span>{p.custom_terms}</p>}
          {d.agreement && (
            <button onClick={openAgreement} className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-gray-900 underline underline-offset-4 decoration-gray-300 hover:decoration-gray-900">
              <FileText size={16} /> View full {d.agreement.title}
            </button>
          )}
        </Section>

        {/* Company */}
        <Section eyebrow="Company details" title="Confirm your company information">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><Field label="Legal company name" required><input className={inputCls(bad('legal_name'))} value={company.legal_name || ''} onChange={e => setCompany(c => ({ ...c, legal_name: e.target.value }))} /></Field></div>
            <Field label="Chamber of Commerce number"><input className={inputCls()} value={company.chamber_of_commerce || ''} onChange={e => setCompany(c => ({ ...c, chamber_of_commerce: e.target.value }))} /></Field>
            <Field label="VAT number"><input className={inputCls()} value={company.vat_code || ''} onChange={e => setCompany(c => ({ ...c, vat_code: e.target.value }))} /></Field>
            <div className="sm:col-span-2 grid grid-cols-[1fr_110px] gap-3">
              <Field label="Billing address" required><input className={inputCls(bad('street'))} placeholder="Street" value={company.street || ''} onChange={e => setCompany(c => ({ ...c, street: e.target.value }))} /></Field>
              <Field label="Number"><input className={inputCls()} value={company.house_number || ''} onChange={e => setCompany(c => ({ ...c, house_number: e.target.value }))} /></Field>
            </div>
            <Field label="Postcode" required><input className={inputCls(bad('postal_code'))} value={company.postal_code || ''} onChange={e => setCompany(c => ({ ...c, postal_code: e.target.value }))} /></Field>
            <Field label="City" required><input className={inputCls(bad('city'))} value={company.city || ''} onChange={e => setCompany(c => ({ ...c, city: e.target.value }))} /></Field>
            <Field label="Country" required><input className={inputCls(bad('country'))} value={company.country || ''} onChange={e => setCompany(c => ({ ...c, country: e.target.value }))} /></Field>
            <Field label="Website"><input className={inputCls()} value={company.website || ''} onChange={e => setCompany(c => ({ ...c, website: e.target.value }))} /></Field>
            <div className="sm:col-span-2">
              <span className="text-[13px] font-medium text-gray-700">Do you need a Purchase Order number on invoices?</span>
              <div className="flex gap-2 mt-1.5">
                {[[false, 'No'], [true, 'Yes']].map(([v, l]) => (
                  <button key={l} type="button" onClick={() => setCompany(c => ({ ...c, po_required: v }))}
                    className={`px-4 py-2 rounded-xl border text-sm font-medium ${company.po_required === v ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-700'}`}>{l}</button>
                ))}
              </div>
              {company.po_required && <div className="mt-3"><Field label="PO number / instructions" required><input className={inputCls(bad('po_instructions'))} value={company.po_instructions || ''} onChange={e => setCompany(c => ({ ...c, po_instructions: e.target.value }))} /></Field></div>}
            </div>
          </div>
        </Section>

        {/* Contact */}
        <Section eyebrow="Main contact" title="Who is our main contact?">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="First name" required><input className={inputCls(bad('first_name'))} value={contact.first_name || ''} onChange={e => setContact(c => ({ ...c, first_name: e.target.value }))} /></Field>
            <Field label="Last name" required><input className={inputCls(bad('last_name'))} value={contact.last_name || ''} onChange={e => setContact(c => ({ ...c, last_name: e.target.value }))} /></Field>
            <Field label="Email" required hint="This is also your portal login."><input type="email" className={inputCls(bad('email'))} value={contact.email || ''} onChange={e => setContact(c => ({ ...c, email: e.target.value }))} /></Field>
            <Field label="Phone number" required><input type="tel" className={inputCls(bad('phone'))} value={contact.phone || ''} onChange={e => setContact(c => ({ ...c, phone: e.target.value }))} /></Field>
            <div className="sm:col-span-2"><Field label="Role"><input className={inputCls()} placeholder="E.g. Marketing Manager" value={contact.role || ''} onChange={e => setContact(c => ({ ...c, role: e.target.value }))} /></Field></div>
          </div>
        </Section>

        {/* Billing */}
        <Section eyebrow="Billing" title="Billing">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-5">
            <div><p className="text-gray-400 text-xs">Plan</p><p className="font-medium text-gray-900">{eur(p.fee_cents)} / {per(p.billing_frequency)}</p></div>
            <div><p className="text-gray-400 text-xs">Billing frequency</p><p className="font-medium text-gray-900 capitalize">{p.billing_frequency}</p></div>
            <div><p className="text-gray-400 text-xs">First billing date</p><p className="font-medium text-gray-900">{fmtDate(p.start_date)}</p></div>
            <div><p className="text-gray-400 text-xs">Payment method</p><p className="font-medium text-gray-900">By invoice</p></div>
          </div>
          <span className="text-[13px] font-medium text-gray-700">Should invoices go to the main contact?</span>
          <div className="flex gap-2 mt-1.5">
            {[[true, 'Yes'], [false, 'No, someone else']].map(([v, l]) => (
              <button key={l} type="button" onClick={() => setBilling(b => ({ ...b, same_as_contact: v }))}
                className={`px-4 py-2 rounded-xl border text-sm font-medium ${billing.same_as_contact === v ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-700'}`}>{l}</button>
            ))}
          </div>
          {!billing.same_as_contact && (
            <div className="grid sm:grid-cols-3 gap-4 mt-4">
              <Field label="Billing contact name" required><input className={inputCls(bad('billing_name'))} value={billing.name} onChange={e => setBilling(b => ({ ...b, name: e.target.value }))} /></Field>
              <Field label="Billing email" required><input type="email" className={inputCls(bad('billing_email'))} value={billing.email} onChange={e => setBilling(b => ({ ...b, email: e.target.value }))} /></Field>
              <Field label="Billing phone"><input type="tel" className={inputCls()} value={billing.phone} onChange={e => setBilling(b => ({ ...b, phone: e.target.value }))} /></Field>
            </div>
          )}
        </Section>

        {/* Accept + start */}
        <section className="bg-white rounded-2xl border border-gray-200/80 p-5 sm:p-7 space-y-3">
          {agreementUnavailable && <p className="text-sm text-amber-800 bg-amber-50 rounded-xl px-4 py-3">The Plan Agreement is being finalised — your Account Manager will let you know when you can activate.</p>}
          <label className={`flex items-start gap-3 cursor-pointer ${touched && !accept ? 'text-red-700' : 'text-gray-800'}`}>
            <input type="checkbox" className="mt-1 w-4 h-4 accent-gray-900" checked={accept} onChange={e => setAccept(e.target.checked)} />
            <span className="text-[15px]">I agree to the{' '}
              <button type="button" onClick={openAgreement} className="font-semibold underline underline-offset-4">{d.agreement?.title || 'Custom95 Plan Agreement'}</button>
              {d.agreement?.version ? <span className="text-gray-400"> ({d.agreement.version})</span> : null}
            </span>
          </label>
          <label className={`flex items-start gap-3 cursor-pointer ${touched && !authorized ? 'text-red-700' : 'text-gray-800'}`}>
            <input type="checkbox" className="mt-1 w-4 h-4 accent-gray-900" checked={authorized} onChange={e => setAuthorized(e.target.checked)} />
            <span className="text-[15px]">I confirm that I am authorised to enter into this agreement on behalf of {company.legal_name || d.company?.name}.</span>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="fixed sm:static inset-x-0 bottom-0 p-3 sm:p-0 bg-white/95 sm:bg-transparent border-t sm:border-0 border-gray-200 backdrop-blur sm:backdrop-blur-none">
            <button onClick={start} disabled={busy || agreementUnavailable}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 hover:bg-black text-white px-6 py-4 text-base font-semibold disabled:opacity-40">
              <Sparkles size={18} /> {busy ? 'Starting your Plan…' : 'Start My Custom95 Plan'}
            </button>
          </div>
          <p className="text-xs text-gray-400 text-center hidden sm:block"><ShieldCheck size={12} className="inline -mt-0.5" /> We record your acceptance and email you a copy for your records.</p>
        </section>
      </main>

      {/* Full agreement: side panel on desktop, full screen on mobile */}
      {showAgreement && d.agreement && (
        <div className="fixed inset-0 z-50 flex">
          <div className="hidden sm:block flex-1 bg-black/30" onClick={() => setShowAgreement(false)} />
          <aside className="w-full sm:w-[560px] h-full bg-white flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <p className="font-semibold text-gray-900">{d.agreement.title}</p>
                <p className="text-xs text-gray-400">Version {d.agreement.version}{d.agreement.effective_date ? ` · effective ${fmtDate(d.agreement.effective_date)}` : ''}</p>
              </div>
              <button onClick={() => setShowAgreement(false)} className="p-2 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {(d.agreement.sections || []).map((s, i) => (
                <div key={s.key || i}>
                  <h3 className="text-sm font-semibold text-gray-900">{i + 1}. {s.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap mt-1">{s.body}</p>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-gray-100">
              <button onClick={() => { setAccept(true); setShowAgreement(false) }} className="w-full rounded-xl bg-gray-900 text-white py-3 font-semibold">I agree — back to my Plan</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
