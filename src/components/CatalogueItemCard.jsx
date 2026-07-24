import { Package, Leaf, Globe, Paintbrush, Sparkles, CheckCircle2, RotateCw } from 'lucide-react'

// Shared catalogue card. Renders both browse-all products and My-Catalogue
// re-order items (which carry an approved design's artwork + title).
export default function CatalogueItemCard({ item, coloursByItem = {}, customizationCountByItem = {}, onClick }) {
  const colours = coloursByItem[item.id] ?? []
  const cusCount = customizationCountByItem[item.id] ?? 0
  const isReorder = !!item._design_id
  const image = item._design_image || item.main_photo_url
  const title = item._design_title || item.name
  return (
    <button onClick={onClick} className={`bg-white rounded-xl border overflow-hidden text-left hover:shadow-sm transition-all ${isReorder ? 'border-emerald-200 hover:border-emerald-400' : 'border-gray-200 hover:border-blue-300'}`}>
      <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden relative">
        {image ? (
          <img src={image} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none' }} />
        ) : (
          <Package size={28} className="text-gray-300" />
        )}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {isReorder && <span className="bg-emerald-500/95 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5"><CheckCircle2 size={9} />Approved design</span>}
          {!isReorder && item.is_sustainable && <span className="bg-green-500/90 text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5"><Leaf size={9} />Sustainable</span>}
          {!isReorder && item.made_in_eu && !item.is_sustainable && <span className="bg-purple-500/90 text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5"><Globe size={9} />EU</span>}
          {!isReorder && item.pantone_match && <span className="bg-indigo-500/90 text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5"><Sparkles size={9} />Pantone</span>}
        </div>
        {!isReorder && cusCount > 0 && (
          <div className="absolute bottom-2 left-2">
            <span className="bg-white/90 text-gray-700 text-[9px] font-medium px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 ring-1 ring-gray-200">
              <Paintbrush size={9} />{cusCount} customization{cusCount === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="text-sm font-medium text-gray-900 truncate">{title}</h3>
        <div className="text-xs text-gray-500 truncate">{item._custom ? 'Custom design' : isReorder ? `On ${item.name}` : (item.category || '')}</div>
        <div className="mt-2 flex items-center justify-between">
          {isReorder ? (
            <span className="text-[10px] text-emerald-700 font-medium inline-flex items-center gap-1"><RotateCw size={10} />Re-order</span>
          ) : (
            <div className="text-[10px] text-gray-400">{item.moq_sales ? `MOQ ${item.moq_sales}` : ''}</div>
          )}
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
