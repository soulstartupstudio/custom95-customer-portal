import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Users, Mail, Phone, MessageCircle, Shield, Plus, Pencil, FileText, Package, Trash2, Send, Wallet, Sparkles, Lock, Check, Loader2 } from 'lucide-react'
import { PageHeader, EmptyState, Spinner, Badge, Card, PrimaryButton } from '../components/ui'
import ContactEditor from '../components/ContactEditor'
import { hasPartnerPlan, requestPlanInterest } from '../lib/planBenefits'

// "Coming soon for partner plans" teaser: track costs & set budgets per department.
function CostsBudgetsTeaser({ company }) {
  const partner = hasPartnerPlan(company)
  const [state, setState] = useState(null) // null | 'sending' | 'sent' | 'error'
  const notify = async () => {
    setState('sending')
    try { await requestPlanInterest({ feature: 'Team costs & budgets' }); setState('sent') }
    catch { setState('error') }
  }
  return (
    <Card>
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
          <Wallet size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900">Costs &amp; budgets</h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold uppercase tracking-wide">Coming soon</span>
            {!partner && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold">
                <Sparkles size={9} />Partnership Plan
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Track spend and set budgets per department, so every team keeps merch spend on plan.
            {partner
              ? ' Rolling out to Partnership Plans soon — your account manager will let you know when it’s live.'
              : ' Part of the Custom95 Partnership Plan.'}
          </p>
          {!partner && (
            <div className="mt-3">
              {state === 'sent' ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700"><Check size={15} />We’ll let you know — request sent</span>
              ) : (
                <button
                  onClick={notify}
                  disabled={state === 'sending'}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                >
                  {state === 'sending' ? <Loader2 size={15} className="animate-spin" /> : <Lock size={14} />}Notify me &amp; my account manager
                </button>
              )}
              {state === 'error' && <p className="text-xs text-red-600 mt-2">Couldn’t send that just now — please try again.</p>}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function ContactCard({ contact, isMe, stats, onEdit, onRemove, onResendInvite, resending }) {
  const initials = [contact.first_name, contact.last_name].filter(Boolean).map((n) => n[0]).join('').toUpperCase()
  return (
    <Card>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-semibold overflow-hidden flex-shrink-0">
          {contact.profile_image_url ? (
            <img src={contact.profile_image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            initials || '?'
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 truncate">{contact.first_name} {contact.last_name}</h3>
              {isMe && <Badge tone="blue">You</Badge>}
              {contact.portal_active && <Badge tone="green"><Shield size={10} className="mr-1" />Portal access</Badge>}
            </div>
            <div className="flex items-center gap-3">
              {!isMe && contact.email && (
                <button
                  onClick={onResendInvite}
                  disabled={resending}
                  className="text-gray-400 hover:text-blue-600 inline-flex items-center gap-1 text-xs disabled:opacity-50"
                  title={contact.portal_active ? 'Resend sign-in link' : 'Send portal invite'}
                >
                  <Send size={12} />{resending ? '…' : contact.portal_active ? 'Resend' : 'Invite'}
                </button>
              )}
              <button
                onClick={onEdit}
                className="text-gray-400 hover:text-blue-600 inline-flex items-center gap-1 text-xs"
                title="Edit"
              >
                <Pencil size={12} />Edit
              </button>
              {!isMe && (
                <button
                  onClick={onRemove}
                  className="text-gray-400 hover:text-red-600 inline-flex items-center gap-1 text-xs"
                  title="Remove team member (revokes portal access)"
                >
                  <Trash2 size={12} />Remove
                </button>
              )}
            </div>
          </div>
          {contact.role && <div className="text-xs text-gray-500 mt-0.5">{contact.role}</div>}
          <div className="mt-3 space-y-1.5">
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600">
                <Mail size={13} className="text-gray-400 flex-shrink-0" />
                <span className="truncate">{contact.email}</span>
              </a>
            )}
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600">
                <Phone size={13} className="text-gray-400 flex-shrink-0" />
                <span>{contact.phone}</span>
              </a>
            )}
            {contact.whatsapp_phone && (
              <a href={`https://wa.me/${contact.whatsapp_phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600">
                <MessageCircle size={13} className="text-gray-400 flex-shrink-0" />
                <span>{contact.whatsapp_phone}</span>
              </a>
            )}
          </div>

          {/* Simple stats */}
          {stats && (
            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
              <Stat icon={FileText} label="Proposals" value={stats.proposals} />
              <Stat icon={Shield} label="Lead on" value={stats.lead} />
              <Stat icon={Package} label="Items added" value={stats.items} />
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg bg-gray-50 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-gray-400 flex items-center justify-center gap-1"><Icon size={9} />{label}</div>
      <div className="text-sm font-semibold text-gray-900">{value ?? 0}</div>
    </div>
  )
}

export default function ContactsPage({ company, contact }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // contact object or 'new'
  const [refresh, setRefresh] = useState(0)
  const [proposalContacts, setProposalContacts] = useState([])
  const [requestedItems, setRequestedItems] = useState([])
  const [resendingId, setResendingId] = useState(null)

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [contactsRes, pcRes, riRes] = await Promise.all([
        supabase
          .from('contacts')
          .select('id, first_name, last_name, role, email, phone, whatsapp_phone, profile_image_url, portal_active, portal_role')
          .eq('company_id', company.id)
          .order('last_name', { nullsFirst: false }),
        supabase.from('proposal_contacts').select('proposal_id, contact_id, role').eq('company_id', company.id),
        supabase.from('proposal_requested_items').select('requested_by_contact_id').eq('company_id', company.id),
      ])
      if (cancelled) return
      setRows(contactsRes.data ?? [])
      setProposalContacts(pcRes.data ?? [])
      setRequestedItems(riRes.data ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company?.id, refresh])

  const statsByContact = useMemo(() => {
    const map = {}
    // Proposals on: distinct proposal_id per contact_id
    const propsByContact = {}
    for (const pc of proposalContacts) {
      if (!propsByContact[pc.contact_id]) propsByContact[pc.contact_id] = new Set()
      propsByContact[pc.contact_id].add(pc.proposal_id)
    }
    // Lead on: count where role === 'lead'
    const leadByContact = {}
    for (const pc of proposalContacts) {
      if (pc.role === 'lead') leadByContact[pc.contact_id] = (leadByContact[pc.contact_id] || 0) + 1
    }
    // Items added by
    const itemsByContact = {}
    for (const ri of requestedItems) {
      if (ri.requested_by_contact_id) itemsByContact[ri.requested_by_contact_id] = (itemsByContact[ri.requested_by_contact_id] || 0) + 1
    }
    for (const c of rows) {
      map[c.id] = {
        proposals: propsByContact[c.id]?.size || 0,
        lead: leadByContact[c.id] || 0,
        items: itemsByContact[c.id] || 0,
      }
    }
    return map
  }, [rows, proposalContacts, requestedItems])

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        subtitle={`${rows.length} ${rows.length === 1 ? 'teammate' : 'teammates'} at ${company?.name}.`}
        action={<PrimaryButton onClick={() => setEditing('new')}><Plus size={14} />Add team member</PrimaryButton>}
      />
      {rows.length === 0 && editing !== 'new' ? (
        <EmptyState
          icon={Users}
          title="No team members yet"
          description="Add your first teammate so we can collaborate."
          action={<PrimaryButton onClick={() => setEditing('new')}><Plus size={14} />Add team member</PrimaryButton>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              isMe={c.id === contact?.id}
              stats={statsByContact[c.id]}
              onEdit={() => setEditing(c)}
              resending={resendingId === c.id}
              onResendInvite={async () => {
                if (!c.email) return
                const action = c.portal_active ? 'resend the sign-in link to' : 'invite'
                if (!confirm(`Send a portal email to ${action} ${c.email}?`)) return
                setResendingId(c.id)
                try {
                  const { data, error } = await supabase.functions.invoke('portal-invite', {
                    body: { contact_id: c.id },
                  })
                  if (error) throw new Error(error.message)
                  if (data?.error) throw new Error(data.error)
                  alert(`Email sent to ${data.email}.`)
                  setRefresh((r) => r + 1)
                } catch (e) {
                  alert(`Failed to send: ${e.message || e}`)
                } finally {
                  setResendingId(null)
                }
              }}
              onRemove={async () => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email
                if (!confirm(`Remove ${name} from your team? This revokes their portal access immediately.`)) return
                const { error } = await supabase.from('contacts').delete().eq('id', c.id)
                if (error) { alert(error.message); return }
                setRefresh((r) => r + 1)
              }}
            />
          ))}
        </div>
      )}

      <CostsBudgetsTeaser company={company} />

      {editing && (
        <ContactEditor
          company={company}
          contact={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); setRefresh((r) => r + 1) }}
        />
      )}
    </div>
  )
}
