import { useEffect, useMemo, useState } from 'react'
import { Check, ArrowLeft, ClipboardList } from 'lucide-react'
import { PageHeader, Spinner, PrimaryButton, SecondaryButton, formatDate } from '../components/ui'
import { MERCH_AUDIT, auditPayload, valuesFromAnswers } from '../lib/merchAudit'
import { fetchPortalPlan, submitMerchAudit } from '../lib/portalPlan'

// The Merch Audit — the starting point of the customer's Merch Plan. Answers go to their
// Account Manager (and into the account's notes in the team app). A draft is kept in this
// browser so a half-filled audit survives a refresh.
const draftKey = (companyId) => `c95.merchAudit.${companyId}`
const readDraft = (id) => { try { return JSON.parse(localStorage.getItem(draftKey(id)) || 'null') } catch { return null } }
const writeDraft = (id, v) => { try { localStorage.setItem(draftKey(id), JSON.stringify(v)) } catch { /* private mode */ } }
const clearDraft = (id) => { try { localStorage.removeItem(draftKey(id)) } catch { /* private mode */ } }

const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'

export default function MerchAuditPage({ company, navigate }) {
  const [loading, setLoading] = useState(true)
  const [previous, setPrevious] = useState(null)
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const d = await fetchPortalPlan()
        if (cancelled) return
        setPrevious(d.audit)
        setValues(readDraft(company?.id) || (d.audit ? valuesFromAnswers(d.audit.answers) : {}))
      } catch (e) { if (!cancelled) setError(e.message) }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [company?.id])

  // `v` may be a function of the current value, so quick successive chip clicks don't
  // overwrite each other.
  const set = (section, field, v) => setValues(prev => {
    const cur = prev[section]?.[field]
    const next = { ...prev, [section]: { ...(prev[section] || {}), [field]: typeof v === 'function' ? v(cur) : v } }
    writeDraft(company?.id, next)
    return next
  })
  const answered = useMemo(() => auditPayload(values).sections.reduce((n, s) => n + s.items.length, 0), [values])
  const total = MERCH_AUDIT.reduce((n, s) => n + s.fields.length, 0)

  const submit = async () => {
    if (!answered) { setError('Answer at least a few questions first.'); return }
    setBusy(true); setError(null)
    try {
      const r = await submitMerchAudit(values)
      clearDraft(company?.id)
      setSent(r)
      window.scrollTo(0, 0)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  if (loading) return <div className="py-20 flex justify-center"><Spinner /></div>

  if (sent) {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4"><Check className="text-green-600" /></div>
        <h1 className="text-xl font-semibold text-gray-900">Thank you — your Merch Audit is in</h1>
        <p className="text-sm text-gray-600 mt-2">Your Account Manager has it now and will use it to prepare your Plan Session, where we map your year together.</p>
        <div className="mt-6 flex justify-center gap-2">
          <PrimaryButton onClick={() => navigate('plan')}>Back to your Plan</PrimaryButton>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-5">
      <button onClick={() => navigate('plan')} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"><ArrowLeft size={14} /> Your Plan</button>
      <PageHeader title="Merch Audit"
        subtitle="Tell us about your brand, your merch today and the moments that matter this year. Answer what you can — your Account Manager goes through the rest with you." />
      {previous && (
        <p className="text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
          You submitted the audit on {formatDate(previous.submitted_at)}{previous.submitted_by ? ` (${previous.submitted_by})` : ''}. Your answers are filled in below — change anything and submit again to send an update.
        </p>
      )}

      {MERCH_AUDIT.map((s, i) => (
        <section key={s.key} className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Part {i + 1} of {MERCH_AUDIT.length}</p>
          <h2 className="text-base font-semibold text-gray-900">{s.title}</h2>
          {s.intro && <p className="text-sm text-gray-500 mt-0.5">{s.intro}</p>}
          {s.key === 'brand' && (
            <button onClick={() => navigate('brand')} className="text-xs text-blue-600 hover:underline mt-1">Upload logos & brand files →</button>
          )}
          <div className="mt-4 space-y-4">
            {s.fields.map(f => {
              const v = values?.[s.key]?.[f.key]
              return (
                <label key={f.key} className="block">
                  <span className="text-sm font-medium text-gray-700">{f.label}</span>
                  <div className="mt-1.5">
                    {f.type === 'chips' ? (
                      <div className="flex flex-wrap gap-2">
                        {f.options.map(o => {
                          const on = (v || []).includes(o)
                          return (
                            <button key={o} type="button"
                              onClick={() => set(s.key, f.key, cur => ((cur || []).includes(o) ? (cur || []).filter(x => x !== o) : [...(cur || []), o]))}
                              className={`px-3 py-1.5 rounded-full text-sm border transition ${on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}`}>
                              {on && <Check size={12} className="inline -mt-0.5 mr-1" />}{o}
                            </button>
                          )
                        })}
                      </div>
                    ) : f.type === 'textarea' ? (
                      <textarea rows={3} className={inputCls} value={v || ''} placeholder={f.placeholder || ''} onChange={e => set(s.key, f.key, e.target.value)} />
                    ) : (
                      <input className={inputCls} value={v || ''} placeholder={f.placeholder || ''} onChange={e => set(s.key, f.key, e.target.value)} />
                    )}
                  </div>
                </label>
              )
            })}
          </div>
        </section>
      ))}

      <div className="sticky bottom-0 bg-white/95 backdrop-blur border border-gray-200 rounded-xl p-4 flex items-center gap-3 flex-wrap">
        <ClipboardList size={18} className="text-gray-400" />
        <span className="text-sm text-gray-600">{answered} of {total} questions answered · your draft is saved on this device</span>
        {error && <span className="text-sm text-red-600 w-full">{error}</span>}
        <div className="ml-auto flex gap-2">
          <SecondaryButton onClick={() => navigate('plan')}>Continue later</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={busy}>{busy ? 'Sending…' : previous ? 'Send update' : 'Submit Merch Audit'}</PrimaryButton>
        </div>
      </div>
    </div>
  )
}
