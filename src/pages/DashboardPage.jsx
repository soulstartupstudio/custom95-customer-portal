import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { FileText, Receipt, Palette, FolderKanban, ArrowRight, Sparkles, Mail, Phone, Package, Clock } from 'lucide-react'
import { Card, Badge, StatusBadge, Spinner, formatCents, formatDate, PrimaryButton } from '../components/ui'
import LoyaltyCard from '../components/LoyaltyCard'

const PLAN_LABELS = { starter: 'Starter', growth: 'Growth', scale: 'Scale', enterprise: 'Enterprise' }

function StatCard({ icon: Icon, label, value, hint, onClick, tone = 'blue' }) {
  const tones = {
    blue: 'text-blue-600 bg-blue-50',
    purple: 'text-purple-600 bg-purple-50',
    green: 'text-green-600 bg-green-50',
    amber: 'text-amber-600 bg-amber-50',
  }
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-5 text-left hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${tones[tone]}`}>
        <Icon size={16} />
      </div>
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
      {hint && <div className="text-xs text-gray-400 mt-0.5">{hint}</div>}
    </button>
  )
}

function ActivityRow({ type, title, subtitle, status, date, onClick }) {
  const icons = { proposal: FileText, quote: Receipt, design: Palette, project: FolderKanban }
  const Icon = icons[type] || FileText
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
        <Icon size={14} className="text-gray-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{title}</div>
        {subtitle && <div className="text-xs text-gray-400 truncate">{subtitle}</div>}
      </div>
      {status && <StatusBadge status={status} />}
      {date && <div className="text-xs text-gray-400 whitespace-nowrap ml-2">{formatDate(date)}</div>}
    </button>
  )
}

export default function DashboardPage({ session, contact, company, navigate }) {
  const [stats, setStats] = useState({ proposals: 0, quotes: 0, designs: 0, projects: 0 })
  const [activity, setActivity] = useState([])
  const [am, setAm] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [propCount, quoteCount, designCount, projCount, recentProp, recentQuote, recentDesign, recentProj, coData] = await Promise.all([
        supabase.from('proposals').select('id', { count: 'exact', head: true }).eq('company_id', company.id).not('status', 'in', '("denied","not_proceeding","completed")'),
        supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('company_id', company.id).neq('status', 'declined'),
        supabase.from('design_tasks').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        supabase.from('projects').select('id', { count: 'exact', head: true }).eq('company_id', company.id).not('stage', 'in', '("delivered","cancelled","completed")'),
        supabase.from('proposals').select('id, proposal_number, name, status, created_at').eq('company_id', company.id).order('created_at', { ascending: false }).limit(3),
        supabase.from('quotes').select('id, status, total_cents, created_at').eq('company_id', company.id).order('created_at', { ascending: false }).limit(3),
        supabase.from('design_tasks').select('id, title, status, created_at').eq('company_id', company.id).order('created_at', { ascending: false }).limit(3),
        supabase.from('projects').select('id, project_number, name, stage, created_at, proposals!projects_proposal_id_fkey(proposal_number)').eq('company_id', company.id).order('created_at', { ascending: false }).limit(3),
        supabase.from('companies').select('am_user_id').eq('id', company.id).single(),
      ])
      if (cancelled) return

      const merged = [
        ...(recentProp.data ?? []).map((r) => ({ type: 'proposal', id: r.id, title: r.name || `Proposal #${r.proposal_number}`, subtitle: `#${r.proposal_number}`, status: r.status, date: r.created_at, tab: 'proposals' })),
        ...(recentQuote.data ?? []).map((r) => ({ type: 'quote', id: r.id, title: `Quote ${formatCents(r.total_cents)}`, status: r.status, date: r.created_at, tab: 'quotes' })),
        ...(recentDesign.data ?? []).map((r) => ({ type: 'design', id: r.id, title: r.title, status: r.status, date: r.created_at, tab: 'designs' })),
        ...(recentProj.data ?? []).map((r) => {
          const num = r.proposals?.proposal_number ?? r.project_number
          return { type: 'project', id: r.id, title: r.name || `Project #${num}`, subtitle: `#${num}`, status: r.stage, date: r.created_at, tab: 'projects' }
        }),
      ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8)

      let amData = null
      if (coData.data?.am_user_id) {
        const { data } = await supabase.from('users').select('full_name, email, phone, avatar_url').eq('id', coData.data.am_user_id).single()
        amData = data
      }

      setStats({
        proposals: propCount.count ?? 0,
        quotes: quoteCount.count ?? 0,
        designs: designCount.count ?? 0,
        projects: projCount.count ?? 0,
      })
      setActivity(merged)
      setAm(amData)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company?.id])

  if (loading) return <Spinner />

  const firstName = contact?.first_name || 'there'

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden">
        <div className="relative z-10 flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {company?.plan_tier && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/15 backdrop-blur ring-1 ring-white/20">
                  <Sparkles size={10} />{PLAN_LABELS[company.plan_tier] || company.plan_tier}
                </span>
              )}
              {company?.brandshop_addon && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/15 backdrop-blur ring-1 ring-white/20">Brandshop</span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold">Welcome back, {firstName}</h1>
            <p className="text-sm text-blue-100 mt-1">Here's what's happening with {company?.name}.</p>
          </div>
          <PrimaryButton onClick={() => navigate('proposals')} className="!bg-white !text-blue-700 hover:!bg-blue-50">
            View proposals<ArrowRight size={14} />
          </PrimaryButton>
        </div>
        <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-white/5 rounded-full"></div>
        <div className="absolute -right-40 -bottom-10 w-64 h-64 bg-white/5 rounded-full"></div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FileText} label="Open proposals" value={stats.proposals} onClick={() => navigate('proposals')} tone="blue" />
        <StatCard icon={Receipt} label="Active quotes" value={stats.quotes} onClick={() => navigate('quotes')} tone="purple" />
        <StatCard icon={Palette} label="Designs" value={stats.designs} onClick={() => navigate('designs')} tone="amber" />
        <StatCard icon={FolderKanban} label="Active projects" value={stats.projects} onClick={() => navigate('projects')} tone="green" />
      </div>

      <LoyaltyCard company={company} onUseCredit={() => navigate('proposals')} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Clock size={14} className="text-gray-400" />Recent activity</h3>
            </div>
            <div>
              {activity.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-gray-400">No activity yet. Start a proposal to get going.</div>
              ) : (
                activity.map((a) => (
                  <ActivityRow key={`${a.type}-${a.id}`} {...a} onClick={() => navigate(a.tab)} />
                ))
              )}
            </div>
          </div>
        </div>

        <Card title="Your account manager">
          {am ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-semibold overflow-hidden">
                  {am.avatar_url ? <img src={am.avatar_url} alt="" className="w-full h-full object-cover" /> : am.full_name?.[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">{am.full_name}</div>
                  <div className="text-xs text-gray-500">Your account manager</div>
                </div>
              </div>
              <div className="space-y-2 pt-2 border-t border-gray-100">
                {am.email && (
                  <a href={`mailto:${am.email}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600">
                    <Mail size={13} className="text-gray-400" /><span className="truncate">{am.email}</span>
                  </a>
                )}
                {am.phone && (
                  <a href={`tel:${am.phone}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600">
                    <Phone size={13} className="text-gray-400" /><span>{am.phone}</span>
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <div className="w-10 h-10 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-2">
                <Package size={16} className="text-gray-400" />
              </div>
              <div className="text-sm text-gray-500">No AM assigned yet.</div>
              <div className="text-xs text-gray-400 mt-1">One will be assigned after your first proposal.</div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
