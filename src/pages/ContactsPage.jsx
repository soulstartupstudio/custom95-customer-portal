import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Users, Mail, Phone, MessageCircle, Shield, Plus, Pencil, FileText, Package } from 'lucide-react'
import { PageHeader, EmptyState, Spinner, Badge, Card, PrimaryButton } from '../components/ui'
import ContactEditor from '../components/ContactEditor'

function ContactCard({ contact, isMe, stats, onEdit }) {
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
            <button
              onClick={onEdit}
              className="text-gray-400 hover:text-blue-600 inline-flex items-center gap-1 text-xs"
              title="Edit"
            >
              <Pencil size={12} />Edit
            </button>
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
            />
          ))}
        </div>
      )}

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
