import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Building2, MapPin, User, Mail, Phone, Hash, Calendar, Sparkles } from 'lucide-react'

const PLAN_LABELS = {
  starter: 'Starter',
  growth: 'Growth',
  scale: 'Scale',
  enterprise: 'Enterprise',
}

const STATUS_STYLES = {
  customer: 'bg-green-50 text-green-700 ring-green-200',
  lead: 'bg-blue-50 text-blue-700 ring-blue-200',
  prospect: 'bg-purple-50 text-purple-700 ring-purple-200',
  churned: 'bg-gray-100 text-gray-600 ring-gray-200',
}

function Badge({ children, tone = 'gray' }) {
  const styles = {
    gray: 'bg-gray-100 text-gray-700 ring-gray-200',
    blue: 'bg-blue-50 text-blue-700 ring-blue-200',
    green: 'bg-green-50 text-green-700 ring-green-200',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${styles[tone] || styles.gray}`}>
      {children}
    </span>
  )
}

function Field({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      {Icon && <Icon size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />}
      <div className="min-w-0">
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-sm text-gray-900 truncate">{value || <span className="text-gray-400">—</span>}</div>
      </div>
    </div>
  )
}

function Card({ title, action, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function AddressCard({ address }) {
  const line1 = [address.street, address.house_number].filter(Boolean).join(' ')
  const line2 = [address.postal_code, address.city].filter(Boolean).join(' ')
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-900">{address.label || 'Address'}</span>
        </div>
        <div className="flex gap-1">
          {address.is_default_delivery && <Badge tone="blue">Delivery</Badge>}
          {address.is_default_billing && <Badge tone="blue">Billing</Badge>}
        </div>
      </div>
      <div className="text-sm text-gray-600 space-y-0.5">
        {line1 && <div>{line1}</div>}
        {line2 && <div>{line2}</div>}
        {address.country && <div>{address.country}</div>}
      </div>
    </div>
  )
}

export default function AccountPage({ company }) {
  const [data, setData] = useState(null)
  const [addresses, setAddresses] = useState([])
  const [am, setAm] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data: co } = await supabase
        .from('companies')
        .select('id, name, status, company_type, segment, plan_tier, brandshop_addon, customer_since, vat_code, support_email, am_user_id')
        .eq('id', company.id)
        .single()
      if (cancelled) return

      const [addrRes, amRes] = await Promise.all([
        supabase
          .from('addresses')
          .select('*')
          .eq('company_id', company.id)
          .is('archived_at', null)
          .order('is_default_delivery', { ascending: false }),
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

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-semibold text-gray-900">{data.name}</h1>
            {data.status && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[data.status] || STATUS_STYLES.customer}`}>
                {data.status}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">Your company details and account info.</p>
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
              <Field
                icon={Calendar}
                label="Customer since"
                value={data.customer_since ? new Date(data.customer_since).toLocaleDateString() : null}
              />
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
                  {am.avatar_url ? (
                    <img src={am.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    am.full_name?.[0]?.toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{am.full_name}</div>
                  <div className="text-xs text-gray-500">Account manager</div>
                </div>
              </div>
              <div className="space-y-2">
                {am.email && (
                  <a href={`mailto:${am.email}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600">
                    <Mail size={14} className="text-gray-400" />
                    <span className="truncate">{am.email}</span>
                  </a>
                )}
                {am.phone && (
                  <a href={`tel:${am.phone}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600">
                    <Phone size={14} className="text-gray-400" />
                    <span>{am.phone}</span>
                  </a>
                )}
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

      <Card title={`Addresses${addresses.length ? ` · ${addresses.length}` : ''}`}>
        {addresses.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center">No addresses on file.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {addresses.map((a) => <AddressCard key={a.id} address={a} />)}
          </div>
        )}
      </Card>
    </div>
  )
}
