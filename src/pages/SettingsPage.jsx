import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Building2, MapPin, User, Mail, Phone, Hash, Calendar, Sparkles, Plus, Pencil } from 'lucide-react'
import { Card, Badge, Field, Spinner, PageHeader, PrimaryButton, SecondaryButton } from '../components/ui'
import AddressEditor from '../components/AddressEditor'
import ContactEditor from '../components/ContactEditor'

const PLAN_LABELS = { starter: 'Starter', growth: 'Growth', scale: 'Scale', enterprise: 'Enterprise' }

const STATUS_STYLES = {
  customer: 'bg-green-50 text-green-700 ring-green-200',
  lead: 'bg-blue-50 text-blue-700 ring-blue-200',
  prospect: 'bg-purple-50 text-purple-700 ring-purple-200',
  churned: 'bg-gray-100 text-gray-600 ring-gray-200',
}

function AddressCard({ address, onEdit }) {
  const line1 = [address.street, address.house_number].filter(Boolean).join(' ')
  const line2 = [address.postal_code, address.city].filter(Boolean).join(' ')
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white group">
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin size={14} className="text-gray-400 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-900 truncate">{address.label || 'Address'}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {address.is_default_delivery && <Badge tone="blue">Delivery</Badge>}
          {address.is_default_billing && <Badge tone="blue">Billing</Badge>}
          <button
            onClick={onEdit}
            className="ml-1 text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Edit"
          >
            <Pencil size={13} />
          </button>
        </div>
      </div>
      <div className="text-sm text-gray-600 space-y-0.5">
        {line1 && <div>{line1}</div>}
        {line2 && <div>{line2}</div>}
        {address.country && <div>{address.country}</div>}
      </div>
      {address.contact_name && (
        <div className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1"><User size={10} />{address.contact_name}</span>
          {address.contact_phone && <span className="inline-flex items-center gap-1"><Phone size={10} />{address.contact_phone}</span>}
          {address.contact_email && <span className="inline-flex items-center gap-1"><Mail size={10} />{address.contact_email}</span>}
        </div>
      )}
    </div>
  )
}

export default function SettingsPage({ company, contact }) {
  const [data, setData] = useState(null)
  const [addresses, setAddresses] = useState([])
  const [am, setAm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editingAddr, setEditingAddr] = useState(null) // address object, 'new', or null
  const [editingProfile, setEditingProfile] = useState(false)
  const [me, setMe] = useState(contact)

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data: co } = await supabase
        .from('companies')
        .select('id, name, status, company_type, segment, plan_tier, brandshop_addon, customer_since, vat_code, support_email, am_user_id')
        .eq('id', company.id).single()
      if (cancelled) return
      const [addrRes, amRes] = await Promise.all([
        supabase.from('addresses').select('*').eq('company_id', company.id).order('is_default_delivery', { ascending: false }),
        co?.am_user_id
          ? supabase.from('users').select('full_name, email, phone, avatar_url').eq('id', co.am_user_id).single()
          : Promise.resolve({ data: null }),
      ])
      if (cancelled) return
      setData(co)
      setAddresses(addrRes.data ?? [])
      setAm(amRes.data)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company?.id])

  const handleAddressSaved = (saved) => {
    setAddresses((arr) => {
      const exists = arr.find((a) => a.id === saved.id)
      return exists ? arr.map((a) => a.id === saved.id ? saved : a) : [saved, ...arr]
    })
    setEditingAddr(null)
  }

  const handleAddressDeleted = (id) => {
    setAddresses((arr) => arr.filter((a) => a.id !== id))
    setEditingAddr(null)
  }

  if (loading || !data) return <Spinner />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Your company details and account manager."
      />

      <div className="space-y-6">
          {/* Your profile */}
          <Card
            title="Your profile"
            action={
              <button
                onClick={() => setEditingProfile(true)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
              >
                <Pencil size={12} />Edit
              </button>
            }
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-base font-semibold overflow-hidden flex-shrink-0">
                {me?.profile_image_url
                  ? <img src={me.profile_image_url} alt="" className="w-full h-full object-cover" />
                  : ([me?.first_name, me?.last_name].filter(Boolean).map((n) => n[0]).join('').toUpperCase() || <User size={20} />)}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">{me?.first_name} {me?.last_name}</div>
                {me?.role && <div className="text-xs text-gray-500">{me.role}</div>}
                <div className="text-xs text-gray-500 mt-1">
                  {me?.email && <span className="inline-flex items-center gap-1 mr-3"><Mail size={11} />{me.email}</span>}
                  {me?.phone && <span className="inline-flex items-center gap-1"><Phone size={11} />{me.phone}</span>}
                </div>
              </div>
            </div>
          </Card>

          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-semibold text-gray-900">{data.name}</h2>
                {data.status && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[data.status] || STATUS_STYLES.customer}`}>
                    {data.status}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">Company details and account manager.</p>
            </div>
            <div className="flex items-center gap-2">
              {data.plan_tier && <Badge tone="blue"><Sparkles size={10} className="mr-1" />{PLAN_LABELS[data.plan_tier] || data.plan_tier}</Badge>}
              {data.brandshop_addon && <Badge tone="green">Brandshop</Badge>}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <Card title="Company details">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field icon={Building2} label="Company type" value={data.company_type} />
                  <Field icon={Building2} label="Segment" value={data.segment} />
                  <Field icon={Hash} label="VAT code" value={data.vat_code} />
                  <Field icon={Mail} label="Support email" value={data.support_email} />
                  <Field icon={Calendar} label="Customer since" value={data.customer_since ? new Date(data.customer_since).toLocaleDateString() : null} />
                  <Field icon={Sparkles} label="Plan" value={PLAN_LABELS[data.plan_tier] || data.plan_tier} />
                </div>
                <p className="text-xs text-gray-400 mt-5 pt-4 border-t border-gray-100">
                  Need to update any of this? Reach out to your account manager.
                </p>
              </Card>
            </div>

            <Card title="Account manager">
              {am ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-semibold overflow-hidden">
                      {am.avatar_url ? <img src={am.avatar_url} alt="" className="w-full h-full object-cover" /> : am.full_name?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{am.full_name}</div>
                      <div className="text-xs text-gray-500">Account manager</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {am.email && <a href={`mailto:${am.email}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600"><Mail size={14} className="text-gray-400" /><span className="truncate">{am.email}</span></a>}
                    {am.phone && <a href={`tel:${am.phone}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600"><Phone size={14} className="text-gray-400" /><span>{am.phone}</span></a>}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-400 py-4 text-center">
                  <User size={20} className="mx-auto mb-2 text-gray-300" />
                  No account manager assigned yet.
                </div>
              )}
            </Card>
          </div>

          <Card
            title={`Addresses${addresses.length ? ` · ${addresses.length}` : ''}`}
            action={
              editingAddr !== 'new' && (
                <button
                  onClick={() => setEditingAddr('new')}
                  className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  <Plus size={14} />Add address
                </button>
              )
            }
          >
            <div className="space-y-3">
              {editingAddr === 'new' && (
                <AddressEditor
                  company={company}
                  title="New address"
                  onSaved={handleAddressSaved}
                  onCancel={() => setEditingAddr(null)}
                />
              )}

              {addresses.length === 0 && editingAddr !== 'new' ? (
                <div className="text-sm text-gray-400 py-6 text-center">
                  No addresses on file. Click "Add address" to create one.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {addresses.map((a) =>
                    editingAddr?.id === a.id ? (
                      <div key={a.id} className="sm:col-span-2">
                        <AddressEditor
                          company={company}
                          address={a}
                          onSaved={handleAddressSaved}
                          onCancel={() => setEditingAddr(null)}
                          onDeleted={() => handleAddressDeleted(a.id)}
                        />
                      </div>
                    ) : (
                      <AddressCard key={a.id} address={a} onEdit={() => setEditingAddr(a)} />
                    )
                  )}
                </div>
              )}
            </div>
          </Card>
      </div>

      {editingProfile && (
        <ContactEditor
          company={company}
          contact={me}
          title="Edit your profile"
          onCancel={() => setEditingProfile(false)}
          onSaved={(saved) => { setMe(saved); setEditingProfile(false) }}
        />
      )}
    </div>
  )
}
