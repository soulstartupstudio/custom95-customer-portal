import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BookOpen, Search } from 'lucide-react'
import { EmptyState, Spinner } from './ui'
import CatalogueItemCard from './CatalogueItemCard'
import ReorderModal from './ReorderModal'
import { fetchMyCatalogueItems } from '../lib/myCatalogue'

// The customer's pre-approved designs (base-product re-orders + custom items),
// each re-orderable in a couple of clicks. Reused on the Catalogue and Brand tabs.
export default function MyCatalogue({ company, contact, onStartProposalWithItems }) {
  const [items, setItems] = useState([])
  const [coloursByItem, setColoursByItem] = useState({})
  const [customizationCountByItem, setCustomizationCountByItem] = useState({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [reorderItem, setReorderItem] = useState(null)

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const arr = await fetchMyCatalogueItems(company.id)
      if (cancelled) return
      setItems(arr)

      // Colour swatches + customization counts for the base-product cards.
      const ids = [...new Set(arr.filter((i) => !i._custom).map((i) => i.id))]
      if (ids.length) {
        const [csRes, czRes] = await Promise.all([
          supabase.from('catalogue_colour_options').select('id, catalogue_item_id, colour_name, hex_code').in('catalogue_item_id', ids).eq('active', true),
          supabase.from('catalogue_customizations').select('id, catalogue_item_id').in('catalogue_item_id', ids),
        ])
        if (!cancelled) {
          const byItem = {}
          for (const c of csRes.data ?? []) (byItem[c.catalogue_item_id] = byItem[c.catalogue_item_id] || []).push(c)
          const counts = {}
          for (const cz of czRes.data ?? []) counts[cz.catalogue_item_id] = (counts[cz.catalogue_item_id] || 0) + 1
          setColoursByItem(byItem); setCustomizationCountByItem(counts)
        }
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company?.id])

  const filtered = useMemo(() => {
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter((i) => (i._design_title || i.name)?.toLowerCase().includes(q) || i.name?.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q))
  }, [items, search])

  const startNewFromReorder = (prefilledItem) => {
    onStartProposalWithItems?.([prefilledItem], {
      name: `Re-order — ${prefilledItem.description}`,
      occasion: 'Other',
      occasion_other: 'Re-order',
      brief_notes: `Re-order of the approved design "${prefilledItem.description}".`,
    })
  }

  if (loading) return <Spinner />

  if (items.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No approved designs yet"
        description="Once a design is approved, it lands here as a re-orderable item."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search your designs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={BookOpen} title="Nothing matches your search" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((i) => (
            <CatalogueItemCard
              key={i.id}
              item={i}
              coloursByItem={coloursByItem}
              customizationCountByItem={customizationCountByItem}
              onClick={() => setReorderItem(i)}
            />
          ))}
        </div>
      )}

      {reorderItem && (
        <ReorderModal
          item={reorderItem}
          company={company}
          contact={contact}
          onClose={() => setReorderItem(null)}
          onAdded={() => setReorderItem(null)}
          onStartNewProposal={startNewFromReorder}
        />
      )}
    </div>
  )
}
