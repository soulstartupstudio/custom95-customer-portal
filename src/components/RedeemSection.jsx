import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Ticket, Gift, Copy, Check, ExternalLink, Sparkles, Package, Users, Boxes, Loader2, ArrowRight, Plus } from 'lucide-react'
import { Badge, StatusBadge, formatDate } from './ui'
import { hasPartnerPlan, requestPlanInterest } from '../lib/planBenefits'
import CreateRedeemModal from './CreateRedeemModal'

// The public redeem page is served by the Custom95 app at /?redeem=<slug>.
const REDEEM_BASE = 'https://team.custom95.com'

const HOW_IT_WORKS = [
  { icon: Boxes, title: 'Pick from your stock', body: 'Choose which of your warehouse products people can claim — with per-person limits, and a pre-order option for items not in stock yet.' },
  { icon: Users, title: 'Share one link', body: 'Send it to your team, clients, or event guests. Optionally lock it to your email domain. No accounts, no payments.' },
  { icon: Package, title: 'We fulfil from stock', body: 'Claims flow straight into fulfilment. Anything pre-ordered beyond stock becomes the “to produce” number.' },
]

function CampaignCard({ c }) {
  const [copied, setCopied] = useState(false)
  const url = `${REDEEM_BASE}/?redeem=${c.slug}`
  const copy = () => { navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">{c.name}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {c.picks_per_person} pick{c.picks_per_person === 1 ? '' : 's'} / person
            {c._claims ? ` · ${c._claims} claim${c._claims === 1 ? '' : 's'}` : ''}
            {c.closes_at ? ` · closes ${formatDate(c.closes_at)}` : ''}
          </div>
        </div>
        <StatusBadge status={c.status} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 min-w-0 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 font-mono truncate">{url}</div>
        <button onClick={copy} title="Copy link" className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
          {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
        </button>
        <a href={url} target="_blank" rel="noreferrer" title="Open" className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"><ExternalLink size={14} /></a>
      </div>
    </div>
  )
}

export default function RedeemSection({ company, contact }) {
  const [campaigns, setCampaigns] = useState([])
  const [hasStock, setHasStock] = useState(false)
  const [loading, setLoading] = useState(true)
  const [interest, setInterest] = useState(null) // null | 'sending' | 'sent' | 'error'
  const [showCreate, setShowCreate] = useState(false)
  const [reload, setReload] = useState(0)
  const partner = hasPartnerPlan(company)

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [campRes, invRes] = await Promise.all([
        supabase.from('redeem_campaigns').select('id, name, slug, status, picks_per_person, opens_at, closes_at, created_at').eq('company_id', company.id).order('created_at', { ascending: false }),
        supabase.from('warehouse_inventory_client').select('available_qty').eq('company_id', company.id),
      ])
      if (cancelled) return
      const list = campRes.data ?? []
      const ids = list.map((c) => c.id)
      if (ids.length) {
        const { data: claims } = await supabase.from('redeem_claims').select('campaign_id, status').in('campaign_id', ids)
        const counts = {}
        for (const cl of claims ?? []) if (cl.status !== 'cancelled') counts[cl.campaign_id] = (counts[cl.campaign_id] || 0) + 1
        list.forEach((c) => { c._claims = counts[c.id] || 0 })
      }
      if (cancelled) return
      setCampaigns(list)
      setHasStock((invRes.data ?? []).some((i) => (i.available_qty ?? 0) > 0))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company?.id, reload])

  const requestInterest = async () => {
    setInterest('sending')
    try { await requestPlanInterest({ feature: 'Redeem pages' }); setInterest('sent') }
    catch { setInterest('error') }
  }

  if (loading) return null

  const canCreate = partner && hasStock
  const CreateButton = ({ label = 'Create redeem page' }) => (
    <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
      <Plus size={15} />{label}
    </button>
  )
  const modal = showCreate && (
    <CreateRedeemModal company={company} contact={contact} onClose={() => setShowCreate(false)} onCreated={() => setReload((r) => r + 1)} />
  )

  // Partner with live campaigns → manage/share them (+ create more if they have stock).
  if (partner && campaigns.length > 0) {
    return (
      <>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Ticket size={16} className="text-indigo-600" />
              <h2 className="text-base font-semibold text-gray-900">Redeem pages</h2>
              <Badge tone="gray">{campaigns.length}</Badge>
            </div>
            {canCreate && <CreateButton label="New" />}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {campaigns.map((c) => <CampaignCard key={c.id} c={c} />)}
          </div>
          <p className="text-xs text-gray-500">Share a link and people claim merch from your stock.</p>
        </div>
        {modal}
      </>
    )
  }

  // Explainer (partner without campaigns, or non-partner).
  return (
    <>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0"><Ticket size={20} /></div>
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-700 mb-0.5">
              <Sparkles size={11} />Redeem pages{!partner && ' · Partnership Plan'}
            </div>
            <h3 className="text-base font-semibold text-gray-900">A simpler alternative to a Brandshop</h3>
            <p className="text-sm text-gray-600 mt-1 leading-relaxed">
              A <strong>redeem page</strong> is a public link where your team, clients, or event guests claim merch straight
              from your warehouse stock — or pre-order what isn't in stock yet. No storefront, no payments, no accounts:
              you share one link and the picks flow into fulfilment. It's the lightweight cousin of a Brandshop.
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 mt-5">
          {HOW_IT_WORKS.map((s) => {
            const Icon = s.icon
            return (
              <div key={s.title} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 text-indigo-600 flex items-center justify-center mb-2"><Icon size={16} /></div>
                <div className="text-sm font-semibold text-gray-900">{s.title}</div>
                <p className="text-[13px] text-gray-600 mt-0.5 leading-relaxed">{s.body}</p>
              </div>
            )
          })}
        </div>
        <div className="mt-5">
          {canCreate ? (
            <div className="flex items-center gap-3 flex-wrap">
              <CreateButton />
              <span className="text-xs text-gray-500">You have warehouse stock — set one up in a minute.</span>
            </div>
          ) : partner ? (
            <p className="text-sm text-gray-500">Add warehouse stock first, then you can create a redeem page here yourself.</p>
          ) : interest === 'sent' ? (
            <span className="inline-flex items-center gap-2 text-sm font-medium text-green-700"><Check size={16} />Request sent — your account manager will reach out</span>
          ) : (
            <button onClick={requestInterest} disabled={interest === 'sending'}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
              {interest === 'sending' ? <Loader2 size={16} className="animate-spin" /> : <Gift size={16} />}
              I want a Redeem page<ArrowRight size={15} />
            </button>
          )}
          {interest === 'error' && <p className="text-sm text-red-600 mt-2">Couldn’t send that just now — please try again.</p>}
          {!partner && interest !== 'sent' && <p className="text-xs text-gray-500 mt-2">Redeem pages are part of the Custom95 Partnership Plan.</p>}
        </div>
      </div>
      {modal}
    </>
  )
}
