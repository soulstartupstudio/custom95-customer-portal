// Settings › Billing (26 Oct 2026): billing details (from Moneybird), automatic payment of plan +
// warehouse invoices by direct debit (a Moneybird Payments mandate — set up once on Moneybird's
// own page, we never see bank details), and the latest plan / warehouse invoices with their status.
// All through the portal-billing function; full-access users only.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CreditCard, CheckCircle2, Loader2, ExternalLink, Receipt, ShieldCheck } from 'lucide-react'
import { Card, PrimaryButton, formatCents, formatDate } from './ui'

const STATE = {
  paid: ['Paid', 'text-green-700 bg-green-50'], open: ['Open', 'text-gray-700 bg-gray-100'], pending_payment: ['Being collected', 'text-blue-700 bg-blue-50'],
  late: ['Overdue', 'text-red-700 bg-red-50'], reminded: ['Overdue', 'text-red-700 bg-red-50'], scheduled: ['Scheduled', 'text-gray-600 bg-gray-100'],
  draft: ['Draft', 'text-gray-500 bg-gray-100'], uncollectible: ['Uncollectible', 'text-red-700 bg-red-50'],
}
const monthLabel = (d) => new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

export async function billingCall(body) {
  const { data, error } = await supabase.functions.invoke('portal-billing', { body })
  if (error) {
    let msg = error.message
    try { const b = await error.context?.json(); if (b?.error) msg = b.error } catch { /* keep */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export default function BillingPanel() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => billingCall({ action: 'status' }).then(setData).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const setUp = async () => {
    setBusy(true); setError(null)
    try {
      const back = `${window.location.origin}/?tab=settings&sub=billing`
      const { url } = await billingCall({ action: 'setup_url', return_url: back })
      window.location.href = url
    } catch (e) { setError(e.message); setBusy(false) }
  }
  const turnOff = async () => {
    if (!confirm('Stop paying plan and warehouse invoices automatically? Open invoices then need to be paid by bank transfer.')) return
    setBusy(true); setError(null)
    try { await billingCall({ action: 'disable' }); await load() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  if (!data && !error) return <div className="py-10 flex justify-center"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
  const m = data?.mandate || {}
  const b = data?.billing

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card title="Automatic payment">
        <div className="flex items-start gap-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${m.active ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
            {m.active ? <CheckCircle2 size={20} /> : <CreditCard size={20} />}
          </div>
          <div className="min-w-0 flex-1">
            {m.active ? (
              <>
                <p className="text-sm font-semibold text-gray-900">Direct debit is on</p>
                <p className="text-sm text-gray-600 mt-0.5">
                  Your plan and warehouse invoices are collected automatically on their due date{m.label ? ` from ${m.label}` : ''}{m.since ? ` · since ${formatDate(m.since)}` : ''}.
                  You still receive every invoice by email.
                </p>
                <button onClick={turnOff} disabled={busy} className="mt-2 text-xs text-gray-500 hover:text-red-600 underline disabled:opacity-50">Turn off direct debit</button>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-gray-900">Pay plan and warehouse invoices automatically</p>
                <p className="text-sm text-gray-600 mt-0.5">
                  Set up direct debit once and we collect each plan and warehouse invoice on its due date. You still receive every invoice by email,
                  and you can turn it off any time. Project invoices are not included.
                </p>
                <p className="text-xs text-gray-500 mt-2 flex items-center gap-1"><ShieldCheck size={12} />You authorise it with your bank on Moneybird’s secure page — we never see your bank details.</p>
                <div className="mt-3"><PrimaryButton onClick={setUp} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}Set up direct debit</PrimaryButton></div>
              </>
            )}
          </div>
        </div>
      </Card>

      <Card title="Billing details">
        {b ? (
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div><dt className="text-xs text-gray-400">Company</dt><dd className="text-gray-900">{b.company_name || '—'}</dd></div>
            <div><dt className="text-xs text-gray-400">Invoices are sent to</dt><dd className="text-gray-900">{[b.attention, b.email].filter(Boolean).join(' · ') || '—'}</dd></div>
            <div><dt className="text-xs text-gray-400">Address</dt><dd className="text-gray-900">{b.address || '—'}</dd></div>
            <div><dt className="text-xs text-gray-400">VAT number</dt><dd className="text-gray-900">{b.vat || '—'}</dd></div>
          </dl>
        ) : <p className="text-sm text-gray-500">No billing details yet.</p>}
        <p className="text-xs text-gray-400 mt-3">Something to change? Ask your account manager — we update it in our bookkeeping too.</p>
      </Card>

      <Card title="Plan & warehouse invoices">
        {!data?.invoices?.length ? <p className="text-sm text-gray-500">No plan or warehouse invoices yet.</p> : (
          <div className="divide-y divide-gray-100">
            {data.invoices.map((i) => {
              const [label, tone] = STATE[i.state] || [i.state || '—', 'text-gray-600 bg-gray-100']
              return (
                <div key={i.id} className="flex items-center gap-3 py-2 text-sm">
                  <Receipt size={14} className="text-gray-300 flex-shrink-0" />
                  <span className="flex-1 min-w-0 text-gray-900">{monthLabel(i.period_month)}</span>
                  {i.due_date && <span className="text-xs text-gray-400 hidden sm:inline">due {formatDate(i.due_date)}</span>}
                  <span className="w-24 text-right font-medium text-gray-900">{formatCents(i.total_cents)}</span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${tone}`}>{label}</span>
                </div>
              )
            })}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">Amounts incl. VAT. Project invoices are under <a href="/?tab=invoices" className="text-blue-600 hover:underline inline-flex items-center gap-0.5">Invoices <ExternalLink size={10} /></a>.</p>
      </Card>
    </div>
  )
}
