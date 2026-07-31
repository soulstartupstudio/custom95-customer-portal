import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BookOpen, Search } from 'lucide-react'
import { PageHeader, EmptyState, Spinner } from '../components/ui'
import CatalogueItemCard from '../components/CatalogueItemCard'
import CatalogueDetail from '../components/CatalogueDetail'
import MyCatalogue from '../components/MyCatalogue'

export default function CataloguePage({ company, contact, onStartProposalWithItem, onStartProposalWithItems }) {
  const [mode, setMode] = useState('all')
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
      const { data } = await supabase
        .from('catalogue_items').select('*').eq('portal_visible', true).eq('active', true).order('name').limit(200)
      if (cancelled) return
      const arr = data ?? []
      setAllItems(arr)

      const ids = arr.map((i) => i.id)
      if (ids.length) {
        const [csRes, czRes] = await Promise.all([
          supabase.from('catalogue_colour_options').select('id, catalogue_item_id, colour_name, hex_code').in('catalogue_item_id', ids).eq('active', true),
          supabase.from('catalogue_customizations').select('id, catalogue_item_id').in('catalogue_item_id', ids),
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

  const categories = useMemo(() => {
    const set = new Set(allItems.map((i) => i.category).filter(Boolean))
    return ['all', ...Array.from(set).sort()]
  }, [allItems])

  const filtered = allItems
    .filter((i) => category === 'all' || i.category === category)
    .filter((i) => !search || i.name?.toLowerCase().includes(search.toLowerCase()) || i.category?.toLowerCase().includes(search.toLowerCase()))

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalogue"
        subtitle={mode === 'mine'
          ? 'Your pre-approved designs — re-order any of them in a couple of clicks, with the same volume pricing.'
          : 'Browse products with live pricing, lead times, and shipping estimates.'}
      />

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setMode('all')} className={`px-3 py-1.5 text-sm font-medium rounded-md ${mode === 'all' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}>
          Browse all
        </button>
        <button onClick={() => setMode('mine')} className={`px-3 py-1.5 text-sm font-medium rounded-md ${mode === 'mine' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}>
          My catalogue
        </button>
      </div>

      {mode === 'mine' ? (
        <MyCatalogue company={company} contact={contact} onStartProposalWithItems={onStartProposalWithItems} />
      ) : (
        <>
          <div className="space-y-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
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
            <EmptyState icon={BookOpen} title="Nothing matches your filters" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filtered.map((i) => (
                <CatalogueItemCard key={i.id} item={i} coloursByItem={coloursByItem} customizationCountByItem={customizationCountByItem} onClick={() => setSelected(i)} />
              ))}
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
        </>
      )}
    </div>
  )
}
