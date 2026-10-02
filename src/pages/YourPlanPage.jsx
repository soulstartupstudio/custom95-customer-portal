import { useEffect, useState } from 'react'
import { Check, FileText, X, Mail, ClipboardList, ArrowRight, ShieldCheck } from 'lucide-react'
import { PageHeader, Spinner, PrimaryButton, SecondaryButton, Badge, formatCents, formatDate } from '../components/ui'
import GettingStarted from '../components/GettingStarted'
import PartnerPlanUpsell from '../components/PartnerPlanUpsell'
import { fetchPortalPlan } from '../lib/portalPlan'
import { planLabel } from '../lib/planBenefits'

const per = (f) => ({ monthly: 'month', quarterly: 'quarter', yearly: 'year' }[f] || 'month')

// "Your Plan": what the customer is on, the terms they accepted, the full agreement, their
// Account Manager, onboarding progress and the Merch Questionnaire.
export default function YourPlanPage({ company, navigate }) {
  const [state, setState] = useState({ loading: true })
  const [showAgreement, setShowAgreement] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchPortalPlan().then(d => !cancelled && setState({ loading: false, data: d }))
      .catch(e => !cancelled && setState({ loading: false, error: e.message }))
    return () => { cancelled = true }
  }, [company?.id])

  if (state.loading) return <div className="py-20 flex justify-center"><Spinner /></div>
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>
  const d = state.data
  if (!d.has_plan) {
    return (
      <div className="space-y-5">
        <PageHeader title="Your Plan" subtitle="You're not on a Custom95 Plan yet." />
        <PartnerPlanUpsell variant="banner" />
      </div>
    )
  }

  const p = d.plan
  const name = p.name || `${planLabel(p.tier) || 'Custom95'} Plan`
  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader title="Your Custom95 Plan" subtitle="Everything about our partnership in one place." />

      <GettingStarted onboarding={d.onboarding} navigate={navigate} />

      <div className="rounded-xl p-6 bg-gray-900 text-white">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><h2 className="text-xl font-semibold">{name}</h2><Badge tone="green">Active</Badge></div>
            <p className="text-gray-400 text-sm mt-0.5">{company?.name}</p>
          </div>
          {p.fee_cents ? <p className="text-2xl font-semibold">{formatCents(p.fee_cents)}<span className="text-sm font-normal text-gray-400"> / {per(p.billing_frequency)}</span></p> : null}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5 pt-4 border-t border-white/10 text-sm">
          <div><p className="text-gray-400 text-xs">Started</p><p className="font-medium">{formatDate(p.start_date)}</p></div>
          {d.account_manager && (
            <div><p className="text-gray-400 text-xs">Account Manager</p>
              <a href={`mailto:${d.account_manager.email}`} className="font-medium inline-flex items-center gap-1 hover:underline"><Mail size={12} /> {d.account_manager.name}</a></div>
          )}
          {p.brandshop_addon && <div><p className="text-gray-400 text-xs">Brandshop</p><p className="font-medium">Included</p></div>}
        </div>
      </div>

      {p.key_terms?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Your agreement</h3>
          <dl className="divide-y divide-gray-100">
            {p.key_terms.map(([k, v]) => (
              <div key={k} className="flex gap-4 py-2 text-sm"><dt className="w-44 shrink-0 text-gray-500">{k}</dt><dd className="text-gray-900">{v}</dd></div>
            ))}
          </dl>
          {p.custom_terms && <p className="text-sm text-gray-700 mt-3"><span className="font-medium">Specific to your Plan: </span>{p.custom_terms}</p>}
          <div className="flex flex-wrap items-center gap-3 mt-4">
            {d.agreement && <SecondaryButton onClick={() => setShowAgreement(true)}><FileText size={14} /> View {d.agreement.title}</SecondaryButton>}
            {p.accepted_by && (
              <span className="text-xs text-gray-500 inline-flex items-center gap-1"><ShieldCheck size={12} /> Accepted by {p.accepted_by.name} on {formatDate(p.accepted_by.at)}{d.agreement ? ` · version ${d.agreement.version}` : ''}</span>
            )}
          </div>
        </div>
      )}

      {p.included?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Included in your Plan</h3>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
            {p.included.map(x => <li key={x} className="flex gap-2 text-sm text-gray-700"><Check size={16} className="text-green-600 shrink-0 mt-0.5" />{x}</li>)}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 flex-wrap">
        <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><ClipboardList size={18} /></div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">Merch Questionnaire</h3>
          <p className="text-xs text-gray-500">{d.audit ? `Filled in on ${formatDate(d.audit.submitted_at)}${d.audit.submitted_by ? ` by ${d.audit.submitted_by}` : ''} — we use it for your Merch Audit.` : 'Your brand, your merch today and the moments that matter — the input for your Merch Audit and Merch Plan.'}</p>
        </div>
        <PrimaryButton onClick={() => navigate('audit')}>{d.audit ? 'View or update' : 'Fill in the questionnaire'} <ArrowRight size={14} /></PrimaryButton>
      </div>

      {showAgreement && d.agreement && (
        <div className="fixed inset-0 z-50 flex">
          <div className="hidden sm:block flex-1 bg-black/30" onClick={() => setShowAgreement(false)} />
          <aside className="w-full sm:w-[600px] h-full bg-white flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <p className="font-semibold text-gray-900">{d.agreement.title}</p>
                <p className="text-xs text-gray-400">Version {d.agreement.version}{d.agreement.effective_date ? ` · effective ${formatDate(d.agreement.effective_date)}` : ''}</p>
              </div>
              <button onClick={() => setShowAgreement(false)} className="p-2 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {(d.agreement.sections || []).map((s, i) => (
                <div key={s.key || i}>
                  <h4 className="text-sm font-semibold text-gray-900">{i + 1}. {s.title}</h4>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap mt-1">{s.body}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
