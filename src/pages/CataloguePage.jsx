import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BookOpen, Package, Leaf, X, Search } from 'lucide-react'
import { PageHeader, EmptyState, Spinner, formatCents, Badge } from '../components/ui'

function CatalogueItemCard({ item, onClick }) {
  return (
    <button onClick={onClick} className="bg-white rounded-xl border border-gray-200 overflow-hidden text-left hover:border-blue-300 hover:shadow-sm transition-all">
      <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
        {item.main_photo_url ? (
          <img src={item.main_photo_url} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none' }} />
        ) : (
          <Package size={28} className="text-gray-300" />
        )}
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-sm font-medium text-gray-900 truncate">{item.name}</h3>
          {item.is_sustainable && <Leaf size={14} className="text-green-600 flex-shrink-0 mt-0.5" />}
        </div>
        {item.category && <div className="text-xs text-gray-500 truncate">{item.category}</div>}
        {item.moq_sales && <div className="text-xs text-gray-400 mt-1">MOQ {item.moq_sales}</div>}
      </div>
    </button>
  )
}

function CatalogueDetail({ item, onClose }) {
  const [tiers, setTiers] = useState([])

  useEffect(() => {
    supabase
      .from('catalogue_pricing_tiers')
      .select('*')
      .eq('catalogue_item_id', item.id)
      .order('qty_from')
      .then(({ data }) => setTiers(data ?? []))
  }, [item.id])

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="text-xs text-gray-500">{item.sku || item.category || 'Product'}</div>
            <h2 className="text-lg font-semibold text-gray-900">{item.name}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-5">
          {item.main_photo_url && (
            <img src={item.main_photo_url} alt="" className="w-full rounded-lg border border-gray-200" onError={(e) => { e.target.style.display = 'none' }} />
          )}
          <div className="flex flex-wrap gap-2">
            {item.category && <Badge>{item.category}</Badge>}
            {item.is_sustainable && <Badge tone="green">Sustainable</Badge>}
            {item.size_variants && <Badge tone="blue">Size variants</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><div className="text-xs text-gray-500">MOQ</div><div className="text-gray-900">{item.moq_sales ?? '—'}</div></div>
            <div><div className="text-xs text-gray-500">Lead time</div><div className="text-gray-900">{item.lead_time_days ? `${item.lead_time_days} days` : '—'}</div></div>
            <div><div className="text-xs text-gray-500">Production time</div><div className="text-gray-900">{item.production_time_days ? `${item.production_time_days} days` : '—'}</div></div>
            <div><div className="text-xs text-gray-500">Transport</div><div className="text-gray-900">{item.transportation_method || '—'}</div></div>
          </div>
          {item.description && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Description</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap">{item.description}</div>
            </div>
          )}
          {tiers.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-2">Pricing tiers</div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Quantity</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Unit price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiers.map((t) => (
                      <tr key={t.id} className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-900">
                          {t.is_sample_tier ? 'Sample' : `${t.qty_from}${t.qty_to ? `–${t.qty_to}` : '+'}`}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-900 font-medium">{formatCents(t.sales_price_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CataloguePage({ company }) {
  const [mode, setMode] = useState('mine')
  const [myItems, setMyItems] = useState([])
  const [allItems, setAllItems] = useState([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [mine, all] = await Promise.all([
        supabase.from('company_catalogue').select('catalogue_item_id, catalogue_items(*)').eq('company_id', company.id),
        supabase.from('catalogue_items').select('*').eq('portal_visible', true).eq('active', true).order('name').limit(200),
      ])
      if (cancelled) return
      setMyItems((mine.data ?? []).map((r) => r.catalogue_items).filter(Boolean))
      setAllItems(all.data ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company?.id])

  const source = mode === 'mine' ? myItems : allItems
  const categories = useMemo(() => {
    const set = new Set(source.map((i) => i.category).filter(Boolean))
    return ['all', ...Array.from(set).sort()]
  }, [source])

  const filtered = source
    .filter((i) => category === 'all' || i.category === category)
    .filter((i) => !search || i.name?.toLowerCase().includes(search.toLowerCase()) || i.category?.toLowerCase().includes(search.toLowerCase()))

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      <PageHeader title="Catalogue" subtitle="Your saved products and browsable catalogue." />

      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button onClick={() => { setMode('mine'); setCategory('all') }} className={`px-3 py-1.5 text-sm font-medium rounded-md ${mode === 'mine' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}>
              My catalogue ({myItems.length})
            </button>
            <button onClick={() => { setMode('all'); setCategory('all') }} className={`px-3 py-1.5 text-sm font-medium rounded-md ${mode === 'all' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}>
              Browse all
            </button>
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        {categories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap ring-1 ring-inset ${
                  category === c ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50'
                }`}
              >
                {c === 'all' ? 'All categories' : c}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={mode === 'mine' && myItems.length === 0 ? 'No saved products yet' : 'Nothing matches your filters'}
          description={mode === 'mine' && myItems.length === 0 ? 'Products from approved designs appear here.' : undefined}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((i) => <CatalogueItemCard key={i.id} item={i} onClick={() => setSelected(i)} />)}
        </div>
      )}

      {selected && <CatalogueDetail item={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
