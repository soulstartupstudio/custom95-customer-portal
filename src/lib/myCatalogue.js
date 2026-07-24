import { supabase } from './supabase'
import { fetchDesignMockupUrls } from './designThumbnails'

// Load a company's My-Catalogue items — both base-product re-orders AND custom
// items — each enriched with the approved design's mock-up image + (when known)
// the exact approved spec. Shared by the Catalogue tab, the Brand tab, and the
// proposal wizard so all three show the same list with the same artwork.
export async function fetchMyCatalogueItems(companyId) {
  if (!companyId) return []
  const { data } = await supabase
    .from('company_catalogue')
    .select('id, catalogue_item_id, source_design_id, notes, custom_name, custom_photo_url, catalogue_items(*), design_tasks:source_design_id(id, title, latest_file_url, status, proposal_requested_items:proposal_requested_item_id(colour_choice, size_breakdown, customization_choices, pantone_code))')
    .eq('company_id', companyId)

  const rows = data ?? []
  const designIds = rows.map((r) => r.source_design_id).filter(Boolean)
  const mockupUrls = designIds.length ? await fetchDesignMockupUrls(designIds) : {}

  return rows.map((r) => {
    const design = r.design_tasks
    const designImage = design ? (mockupUrls[design.id] || design.latest_file_url || null) : null
    if (!r.catalogue_items) {
      return {
        _custom: true,
        _cc_id: r.id,
        id: r.id,
        name: r.custom_name || design?.title || 'Custom item',
        category: 'Custom',
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
