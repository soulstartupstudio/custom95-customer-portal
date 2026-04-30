import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Store, ExternalLink, Package, DollarSign } from 'lucide-react'
import { PageHeader, EmptyState, Spinner, StatusBadge, Card, formatCents, formatDate } from '../components/ui'

function ShopCard({ shop }) {
  return (
    <Card>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-gray-900 truncate">{shop.shop_name || shop.shop_domain}</h3>
            <StatusBadge status={shop.connection_status} />
          </div>
          <a href={`https://${shop.shop_domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 truncate">
            {shop.shop_domain}<ExternalLink size={12} />
          </a>
        </div>
        <div className="flex gap-3 text-sm">
          <div className="text-center">
            <div className="text-xs text-gray-500">Orders</div>
            <div className="text-lg font-semibold text-gray-900">{shop.total_orders_count ?? 0}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500">Revenue</div>
            <div className="text-lg font-semibold text-gray-900">{formatCents(shop.total_revenue_cents)}</div>
          </div>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-3 text-xs text-gray-500">
        <div><div className="text-gray-400">Plan</div><div className="text-gray-900">{shop.plan_name || '—'}</div></div>
        <div><div className="text-gray-400">Currency</div><div className="text-gray-900">{shop.currency || '—'}</div></div>
        <div><div className="text-gray-400">Connected</div><div className="text-gray-900">{formatDate(shop.connected_at) || '—'}</div></div>
        <div><div className="text-gray-400">Last sync</div><div className="text-gray-900">{formatDate(shop.last_sync_at) || '—'}</div></div>
      </div>
      {shop.connection_error && (
        <div className="mt-3 text-xs text-red-600 bg-red-50 p-2 rounded-lg">{shop.connection_error}</div>
      )}
    </Card>
  )
}

export default function BrandshopPage({ company }) {
  const [shops, setShops] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('brandshops')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
      if (cancelled) return
      setShops(data ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company?.id])

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      <PageHeader title="Brandshop" subtitle="Your connected storefronts." />
      {shops.length === 0 ? (
        <EmptyState
          icon={Store}
          title="No brandshops yet"
          description="Reach out to your account manager to set up a white-label storefront."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {shops.map((s) => <ShopCard key={s.id} shop={s} />)}
        </div>
      )}
    </div>
  )
}
