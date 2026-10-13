import { supabase } from './supabase'
import { fetchDesignMockupUrls } from './designThumbnails'

// Load a company's My-Catalogue items — both base-product re-orders AND custom
// items — each enriched with the approved design's mock-up image + (when known)
// the exact approved spec. Shared by the Catalogue tab, the Brand tab, and the
// proposal wizard so all three show the same list with the same artwork.
//
// Every row also carries what a re-order needs to be priced on the spot:
// the company's own price bands (`_cc_tiers`), the minimum quantity (`moq`),
// and, for custom rows, the sizes or variants the customer picks quantities for.

export function parseSizes(text) {
  if (!text) return []
  return String(text).split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean)
}

export function sortTiers(tiers) {
  return (tiers ?? [])
    .filter((t) => !t.is_sample_tier)
    .slice()
    .sort((a, b) => (a.qty_from ?? 0) - (b.qty_from ?? 0))
}

export function lowestTierPrice(tiers) {
  const prices = (tiers ?? []).map((t) => t.sales_price_cents).filter((n) => n != null)
  return prices.length ? Math.min(...prices) : null
}

export async function fetchMyCatalogueItems(companyId) {
  if (!companyId) return []
  const { data } = await supabase
    .from('company_catalogue')
    .select('id, catalogue_item_id, source_design_id, notes, custom_name, custom_photo_url, moq, available_sizes, variants, company_catalogue_pricing_tiers(*), catalogue_items(*), design_tasks:source_design_id(id, title, latest_file_url, status, proposal_requested_items:proposal_requested_item_id(colour_choice, size_breakdown, customization_choices, pantone_code))')
    .eq('company_id', companyId)

  const rows = data ?? []
  const designIds = rows.map((r) => r.source_design_id).filter(Boolean)
  const mockupUrls = designIds.length ? await fetchDesignMockupUrls(designIds) : {}

  return rows.map((r) => {
    const design = r.design_tasks
    const designImage = design ? (mockupUrls[design.id] || design.latest_file_url || null) : null
    const ccTiers = sortTiers(r.company_catalogue_pricing_tiers)
    const variants = Array.isArray(r.variants) ? r.variants.filter((v) => v && v.label) : []
    if (!r.catalogue_items) {
      return {
        _custom: true,
        _cc_id: r.id,
        id: r.id,
        name: r.custom_name || design?.title || 'Custom item',
        category: 'Custom',
        moq: r.moq || null,
        _cc_tiers: ccTiers,
        _available_sizes: parseSizes(r.available_sizes),
        _variants: variants,
        _design_id: r.source_design_id || null,
        _design_title: r.custom_name || design?.title || null,
        _design_image: designImage || r.custom_photo_url || null,
        _cc_notes: r.notes || null,
      }
    }
    const base = r.catalogue_items
    const spec = design?.proposal_requested_items || null
    return {
      ...base,
      _cc_id: r.id,
      moq: r.moq || base.moq_sales || null,
      _cc_tiers: ccTiers,
      _available_sizes: parseSizes(r.available_sizes),
      _variants: variants,
      _design_id: r.source_design_id || null,
      _design_title: design?.title || null,
      _design_image: designImage,
      _cc_notes: r.notes || null,
      _locked_spec: spec ? {
        colour_choice: spec.colour_choice || null,
        size_breakdown: spec.size_breakdown || null,
        customization_choices: spec.customization_choices || null,
        pantone_code: spec.pantone_code || null,
      } : null,
    }
  })
}

// The note that travels with a My-Catalogue re-order line: tells the team which
// saved product it is and where its photo lives, so the project line is
// self-explanatory even without a design task.
export function reorderNote(item) {
  const title = item._design_title || item.name
  const parts = [`Re-order from My Catalogue: ${title}`]
  const sku = (item._cc_notes || '').match(/SKU\s+([^\n]+)/i)?.[1]
  if (sku) parts.push(`SKU ${sku.trim()}`)
  if (item._design_image) parts.push(`photo: ${item._design_image}`)
  return parts.join(' · ')
}
