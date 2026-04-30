import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Users, Mail, Phone, MessageCircle, Shield } from 'lucide-react'
import { PageHeader, EmptyState, Spinner, Badge, Card } from '../components/ui'

function ContactCard({ contact, isMe }) {
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
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900">
              {contact.first_name} {contact.last_name}
            </h3>
            {isMe && <Badge tone="blue">You</Badge>}
            {contact.portal_active && <Badge tone="green"><Shield size={10} className="mr-1" />Portal access</Badge>}
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
        </div>
      </div>
    </Card>
  )
}

export default function ContactsPage({ company, contact }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, role, email, phone, whatsapp_phone, profile_image_url, portal_active, portal_role')
        .eq('company_id', company.id)
        .order('last_name', { nullsFirst: false })
      if (cancelled) return
      setRows(data ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company?.id])

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      <PageHeader title="Contacts" subtitle={`${rows.length} ${rows.length === 1 ? 'contact' : 'contacts'} at ${company?.name}.`} />
      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No contacts yet" description="Invite your teammates via your account manager." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((c) => <ContactCard key={c.id} contact={c} isMe={c.id === contact?.id} />)}
        </div>
      )}
    </div>
  )
}
