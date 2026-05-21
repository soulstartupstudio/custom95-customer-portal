import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BookOpen, Package, Leaf, Search, Globe, Paintbrush, Sparkles } from 'lucide-react'
import { PageHeader, EmptyState, Spinner } from '../components/ui'
import CatalogueDetail from '../components/CatalogueDetail'

function CatalogueItemCard({ item, coloursByItem, customizationCountByItem, onClick }) {
  const colours = coloursByItem[item.id] ?? []
  const cusCount = customizationCountByItem[item.id] ?? 0
  return (
    <button onClick={onClick} className="bg-white rounded-xl border border-gray-200 overflow-hidden text-left hover:border-blue-300 hover:shadow-sm transition-all">
      <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden relative">
        {item.main_photo_url ? (
          <img src={item.main_photo_url} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none' }} />
        ) : (
          <Package size={28} className="text-gray-300" />
        )}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {item.is_sustainable && <span className="bg-green-500/90 text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5"><Leaf size={9} />Sustainable</span>}
          {item.made_in_eu && !item.is_sustainable && <span className="bg-purple-500/90 text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5"><Globe size={9} />EU</span>}
          {item.pantone_match && <span className="bg-indigo-500/90 text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5"><Sparkles size={9} />Pantone</span>}
        </div>
        {cusCount > 0 && (
          <div className="absolute bottom-2 left-2">
            <span className="bg-white/90 text-gray-700 text-[9px] font-medium px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 ring-1 ring-gray-200">
              <Paintbrush size={9} />{cusCount} customization{cusCount === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="text-sm font-medium text-gray-900 truncate">{item.name}</h3>
        {item.category && <div className="text-xs text-gray-500 truncate">{item.category}</div>}
        <div className="mt-2 flex items-center justify-between">
          <div className="text-[10px] text-gray-400">{item.moq_sales ? `MOQ ${item.moq_sales}` : ''}</div>
          {colours.length > 0 && (
            <div className="flex items-center -space-x-1" title={`${colours.length} colour${colours.length === 1 ? '' : 's'} available`}>
              {colours.slice(0, 4).map((c) => (
                <span
                  key={c.id}
                  className="w-3.5 h-3.5 rounded-full border border-white ring-1 ring-gray-200"
                  style={{ backgroundColor: c.hex_code || '#e5e7eb' }}
                  title={c.colour_name}
                />
              ))}
              {colours.length > 4 && <span className="text-[9px] text-gray-500 ml-1">+{colours.length - 4}</span>}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

export default function CataloguePage({ company, contact, onStartProposalWithItem }) {
  const [mode, setMode] = useState('all')
  const [myItems, setMyItems] = useState([])
  const [allItems, setAllItems] = useState([])
  const [coloursByItem, setColoursByItem] = useState({})
  const [customizationCountByItem, setCustomizationCountByItem] = useState({})
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
      const myArr = (mine.data ?? []).map((r) => r.catalogue_items).filter(Boolean)
      const allArr = all.data ?? []
      setMyItems(myArr)
      setAllItems(allArr)

      // Fetch colour swatches + customization counts for all visible items so cards can preview
      const ids = [...new Set([...myArr, ...allArr].map((i) => i.id))]
      if (ids.length) {
        const [csRes, czRes] = await Promise.all([
          supabase
            .from('catalogue_colour_options')
            .select('id, catalogue_item_id, colour_name, hex_code')
            .in('catalogue_item_id', ids)
            .eq('active', true),
          supabase
            .from('catalogue_customizations')
            .select('id, catalogue_item_id')
            .in('catalogue_item_id', ids),
        ])
        const byItem = {}
        for (const c of csRes.data ?? []) (byItem[c.catalogue_item_id] = byItem[c.catalogue_item_id] || []).push(c)
        const counts = {}
        for (const cz of czRes.data ?? []) counts[cz.catalogue_item_id] = (counts[cz.catalogue_item_id] || 0) + 1
        if (!cancelled) { setColoursByItem(byItem); setCustomizationCountByItem(counts) }
      }

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
      <PageHeader title="Catalogue" subtitle="Browse products with live pricing, lead times, and shipping estimates." />

      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button onClick={() => { setMode('all'); setCategory('all') }} className={`px-3 py-1.5 text-sm font-medium rounded-md ${mode === 'all' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}>
              Browse all
            </button>
            <button onClick={() => { setMode('mine'); setCategory('all') }} className={`px-3 py-1.5 text-sm font-medium rounded-md ${mode === 'mine' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}>
              My catalogue ({myItems.length})
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
          {filtered.map((i) => <CatalogueItemCard key={i.id} item={i} coloursByItem={coloursByItem} customizationCountByItem={customizationCountByItem} onClick={() => setSelected(i)} />)}
        </div>
      )}

      {selected && (
        <CatalogueDetail
          item={selected}
          company={company}
          contact={contact}
          onClose={() => setSelected(null)}
          onAddedToProposal={() => setSelected(null)}
          onStartNewProposal={(prefilled) => {
            setSelected(null)
            onStartProposalWithItem?.(prefilled)
          }}
        />
      )}
    </div>
  )
}
