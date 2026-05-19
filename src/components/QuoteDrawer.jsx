import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Download, X, Check, ThumbsDown, AlertCircle, Clock } from 'lucide-react'
import { StatusBadge, formatCents, formatDate, PrimaryButton, SecondaryButton, Badge, deriveQuoteBreakdown } from './ui'

const PIPELINE = [
  { id: 'draft', label: 'Finalising quote' },
  { id: 'sent', label: 'Ready for you' },
  { id: 'accepted', label: 'Accepted' },
]

const STATUS_LABELS = {
  draft: 'Finalising quote',
  sent: 'Ready for approval',
  accepted: 'Accepted',
  declined: 'Declined',
}

function Pipeline({ status }) {
  const idx = PIPELINE.findIndex((s) => s.id === status)
  const declined = status === 'declined'
  return (
    <div>
      <div className="flex items-center gap-1">
        {PIPELINE.map((s, i) => (
          <div key={s.id} className="flex-1 h-1.5 rounded-full bg-gray-200">
            <div className={`h-full rounded-full ${declined ? 'bg-red-200' : i <= idx ? 'bg-blue-500' : ''}`} style={{ width: declined || i <= idx ? '100%' : '0%' }} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-1.5">
        {PIPELINE.map((s, i) => (
          <div key={s.id} className={`text-[11px] font-medium ${declined ? 'text-gray-400' : i <= idx ? 'text-blue-700' : 'text-gray-400'}`}>
            {s.label}
          </div>
        ))}
      </div>
      {declined && (
        <div className="mt-2 inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-1 rounded">
          <AlertCircle size={12} />You declined this quote
        </div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-gray-700">
      <span>{label}</span>
      <span className="text-gray-900">{value}</span>
    </div>
  )
}

export default function QuoteDrawer({ quote, company, contact, onClose, onUpdated }) {
  const [items, setItems] = useState([])
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState(null)

  useEffect(() => {
    supabase
      .from('quote_line_items_client')
      .select('*')
      .eq('quote_id', quote.id)
      .order('sort_order')
      .then(({ data }) => setItems(data ?? []))
  }, [quote.id])

  const isDraft = quote.status === 'draft'
  const isActionable = quote.status === 'sent'
  const isAccepted = quote.status === 'accepted'
  const isDeclined = quote.status === 'declined'
  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ')

  const accept = async () => {
    setBusy(true); setError(null)
    const { error: err } = await supabase.from('quotes').update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_by_name: contactName,
    }).eq('id', quote.id)
    if (!err && feedback.trim()) {
      await supabase.from('comments').insert({
        company_id: company.id, entity_type: 'quote', entity_id: quote.id,
        author_contact_id: contact.id, author_name: contactName,
        body: `✅ Accepted quote.\n\n${feedback.trim()}`,
      })
    }
    setBusy(false)
    if (err) { setError(err.message); return }
    onUpdated?.(); onClose()
  }

  const decline = async () => {
    if (!feedback.trim()) { setError('Please tell us why so we can improve our next quote.'); return }
    setBusy(true); setError(null)
    const { error: err } = await supabase.from('quotes').update({ status: 'declined' }).eq('id', quote.id)
    if (!err) {
      await supabase.from('comments').insert({
        company_id: company.id, entity_type: 'quote', entity_id: quote.id,
        author_contact_id: contact.id, author_name: contactName,
        body: `❌ Declined quote.\n\n${feedback.trim()}`,
      })
    }
    setBusy(false)
    if (err) { setError(err.message); return }
    onUpdated?.(); onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="text-xs text-gray-500">Quote · {formatDate(quote.created_at)}</div>
            <h2 className="text-lg font-semibold text-gray-900">{formatCents(quote.total_cents)}</h2>
          </div>
          <div className="flex items-center gap-2">
            {quote.quote_pdf_url && (
              <a href={quote.quote_pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:text-blue-600 px-3 py-1.5 border border-gray-200 rounded-lg">
                <Download size={14} />PDF
              </a>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <Badge tone={isDraft ? 'gray' : isActionable ? 'blue' : isAccepted ? 'green' : 'red'}>{STATUS_LABELS[quote.status] || quote.status}</Badge>
              {quote.payment_terms && <Badge>{quote.payment_terms}</Badge>}
            </div>
            <Pipeline status={quote.status} />
          </div>

          {isDraft && (
            <div className="border border-gray-200 bg-gray-50 rounded-lg p-4 flex items-start gap-3">
              <Clock size={16} className="text-gray-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-gray-900 mb-1">Live draft — we're finalising your quote</div>
                <div className="text-xs text-gray-600">
                  Prices below are live tier-based estimates that update as you add or change items. Custom items and logistics are priced by our team, usually within one business day.
                </div>
              </div>
            </div>
          )}

          {isAccepted && (
            <div className="border border-green-200 bg-green-50 rounded-lg p-3 flex items-start gap-3">
              <Check size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-green-900">You accepted this quote</div>
                <div className="text-xs text-green-700">by {quote.accepted_by_name || 'you'} on {formatDate(quote.accepted_at)}</div>
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-2 font-semibold">Line items</div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Description</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 w-20">Qty</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 w-24">Unit</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 w-28">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id} className="border-t border-gray-100">
                        <td className="px-3 py-2">
                          <div className="text-gray-900">{i.description}</div>
                          {i.selected_colour && <div className="text-xs text-gray-500 mt-0.5">Colour: {i.selected_colour}</div>}
                          {(i.customization_notes || i.notes) && <div className="text-xs text-gray-500 mt-0.5">{i.customization_notes || i.notes}</div>}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">{i.quantity}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{formatCents(i.unit_sales_price_cents)}</td>
                        <td className="px-3 py-2 text-right text-gray-900 font-medium">{formatCents(i.total_sales_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Full breakdown */}
          {(() => {
            const b = deriveQuoteBreakdown(quote, items)
            return (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wide">Breakdown</div>
                <div className="p-4 space-y-1.5 text-sm">
                  <Row label="Items subtotal" value={formatCents(b.items_subtotal || b.after_discount)} />
                  {b.discount > 0 && (
                    <Row label="Discount" value={<span className="text-red-600">−{formatCents(b.discount)}</span>} />
                  )}
                  {b.delivery > 0 && <Row label="Delivery" value={formatCents(b.delivery)} />}
                  <div className="border-t border-gray-100 my-1" />
                  <Row label={`VAT${b.vat_rate ? ` (${b.vat_rate}%)` : ''}`} value={formatCents(b.vat)} />
                  <div className="border-t border-gray-200 my-1" />
                  <Row label={<span className="text-base font-semibold text-gray-900">Total</span>} value={<span className="text-base font-bold text-gray-900">{formatCents(b.total)}</span>} />
                </div>
              </div>
            )
          })()}

          {quote.notes && (
            <div>
              <div className="text-xs text-gray-500 mb-1 font-semibold">Notes</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{quote.notes}</div>
            </div>
          )}

          {isActionable && (
            <div className="border-t border-gray-100 pt-5">
              <div className="text-sm font-semibold text-gray-900 mb-3">Your decision</div>
              {mode === 'decline' ? (
                <div className="space-y-3">
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={3}
                    placeholder="Why are you declining? Pricing, timing, anything we can improve?"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-2 justify-end">
                    <SecondaryButton onClick={() => { setMode(null); setFeedback('') }} disabled={busy}>Cancel</SecondaryButton>
                    <PrimaryButton onClick={decline} disabled={busy} className="!bg-red-600 hover:!bg-red-700">
                      <ThumbsDown size={14} />{busy ? 'Submitting…' : 'Decline quote'}
                    </PrimaryButton>
                  </div>
                  {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>}
                </div>
              ) : mode === 'accept' ? (
                <div className="space-y-3">
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={3}
                    placeholder="Any notes for the team? (optional)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-2 justify-end">
                    <SecondaryButton onClick={() => { setMode(null); setFeedback('') }} disabled={busy}>Cancel</SecondaryButton>
                    <PrimaryButton onClick={accept} disabled={busy}>
                      <Check size={14} />{busy ? 'Accepting…' : 'Confirm acceptance'}
                    </PrimaryButton>
                  </div>
                  {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>}
                </div>
              ) : (
                <div className="flex gap-2">
                  <PrimaryButton onClick={() => setMode('accept')} className="flex-1 justify-center py-3 text-base">
                    <Check size={16} />Accept quote
                  </PrimaryButton>
                  <SecondaryButton onClick={() => setMode('decline')} className="flex-1 justify-center py-3">
                    <ThumbsDown size={16} />Decline
                  </SecondaryButton>
                </div>
              )}
            </div>
          )}

          {isDeclined && (
            <div className="border-t border-gray-100 pt-5">
              <div className="text-sm text-gray-500">
                This quote was declined. Your team is working on an updated proposal — check the comments below.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
