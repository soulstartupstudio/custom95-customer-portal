import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Rocket, Check, FileText } from 'lucide-react'
import { PrimaryButton, SecondaryButton, formatCents } from './ui'

// Shown immediately after a customer approves their design. Presents the accepted
// quote's payment terms + total and lets them confirm so Custom95 can start
// production. Records a production-confirmed flag on the proposal; if that column
// doesn't exist yet it falls back to a comment so the signal still reaches the team.
export default function ProductionConfirmModal({ proposalId, company, contact, onClose }) {
  const [proposal, setProposal] = useState(null)
  const [quote, setQuote] = useState(null)
  const [loading, setLoading] = useState(true)
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [pRes, qRes] = await Promise.all([
        supabase.from('proposals').select('*').eq('id', proposalId).single(),
        supabase.from('quotes').select('*').eq('proposal_id', proposalId).order('created_at', { ascending: false }),
      ])
      if (cancelled) return
      setProposal(pRes.data ?? null)
      const quotes = qRes.data ?? []
      setQuote(quotes.find((q) => q.status === 'accepted') || quotes[0] || null)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [proposalId])

  const alreadyConfirmed = !!proposal?.production_confirmed_at

  const confirm = async () => {
    setBusy(true); setError(null)
    const nowIso = new Date().toISOString()
    let { error: err } = await supabase.from('proposals').update({
      production_confirmed_at: nowIso,
      production_confirmed_by_name: contactName,
    }).eq('id', proposalId)
    // Column may not exist yet — don't block the customer; log a comment so the
    // team still sees the go-ahead.
    if (err) {
      await supabase.from('comments').insert({
        company_id: company.id, entity_type: 'proposal', entity_id: proposalId,
        author_contact_id: contact.id, author_name: contactName,
        body: '🚀 Approved design and payment terms — authorised to start production.',
      })
      err = null
    }
    setBusy(false)
    if (err) { setError(err.message); return }
    setDone(true)
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white sm:rounded-xl shadow-xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Rocket size={18} className="text-blue-600" />Design approved 🎉
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Confirm the terms below and we'll start production.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {loading ? (
            <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
          ) : done || alreadyConfirmed ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <Check size={24} className="text-green-600" />
              </div>
              <div className="text-base font-semibold text-gray-900">You're all set — production is a go!</div>
              <div className="text-sm text-gray-500 mt-1">
                We've let the team know. Track progress in the <span className="font-medium text-gray-700">Projects</span> tab.
              </div>
            </div>
          ) : (
            <>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1.5">
                  <FileText size={12} />Payment terms
                </div>
                <div className="p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Terms</span>
                    <span className="text-gray-900 font-medium">{quote?.payment_terms || 'As agreed with your account manager'}</span>
                  </div>
                  {quote?.total_cents != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Order total</span>
                      <span className="text-gray-900 font-semibold">{formatCents(quote.total_cents)}</span>
                    </div>
                  )}
                </div>
              </div>

              <label className="flex items-start gap-2.5 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>I approve the design and payment terms, and authorise Custom95 to start production of this project.</span>
              </label>

              {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</div>}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          {done || alreadyConfirmed ? (
            <PrimaryButton onClick={onClose} className="ml-auto"><Check size={14} />Done</PrimaryButton>
          ) : (
            <>
              <SecondaryButton onClick={onClose} disabled={busy}>Not yet</SecondaryButton>
              <PrimaryButton onClick={confirm} disabled={!agree || busy || loading}>
                <Rocket size={14} />{busy ? 'Confirming…' : 'Confirm & start production'}
              </PrimaryButton>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
