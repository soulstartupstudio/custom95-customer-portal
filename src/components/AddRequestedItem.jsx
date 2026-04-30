import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Package, Search } from 'lucide-react'
import { PrimaryButton, SecondaryButton } from './ui'

export default function AddRequestedItem({ proposalId, company, contact, onAdded }) {
  const [open, setOpen] = useState(false)
  const [catalogue, setCatalogue] = useState([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({
    description: '',
    quantity: '',
    reference_url: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    supabase
      .from('catalogue_items')
      .select('id, name, category, main_photo_url, sku, moq_sales')
      .eq('portal_visible', true)
      .eq('active', true)
      .order('name')
      .limit(100)
      .then(({ data }) => setCatalogue(data ?? []))
  }, [open])

  const pick = (item) => {
    setSelected(item)
    setForm((f) => ({ ...f, description: f.description || item.name }))
  }

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    const { error: err } = await supabase.from('proposal_requested_items').insert({
      proposal_id: proposalId,
      company_id: company.id,
      catalogue_item_id: selected?.id || null,
      description: form.description.trim() || selected?.name || 'Custom item',
      quantity: form.quantity ? Number(form.quantity) : null,
      reference_url: form.reference_url.trim() || null,
      notes: form.notes.trim() || null,
      requested_by_contact_id: contact.id,
    })
    setSubmitting(false)
    if (err) { setError(err.message); return }
    setOpen(false)
    setSelected(null)
    setForm({ description: '', quantity: '', reference_url: '', notes: '' })
    onAdded?.()
  }

  const filtered = search
    ? catalogue.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.category?.toLowerCase().includes(search.toLowerCase()))
    : catalogue

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/40 transition-colors"
      >
        <Plus size={14} />Add item to proposal
      </button>
    )
  }

  return (
    <div className="border border-blue-200 bg-blue-50/30 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">Add item</div>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
      </div>

      {!selected ? (
        <>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search catalogue or skip to custom…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          <div className="max-h-60 overflow-y-auto space-y-1 bg-white rounded-lg border border-gray-200 p-1">
            {filtered.slice(0, 20).map((c) => (
              <button
                key={c.id}
                onClick={() => pick(c)}
                className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-gray-50 text-left"
              >
                <div className="w-10 h-10 rounded-md bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {c.main_photo_url ? (
                    <img src={c.main_photo_url} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none' }} />
                  ) : (
                    <Package size={16} className="text-gray-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 truncate">{c.name}</div>
                  <div className="text-xs text-gray-500 truncate">{c.category || 'Product'}{c.moq_sales ? ` · MOQ ${c.moq_sales}` : ''}</div>
                </div>
              </button>
            ))}
            {filtered.length === 0 && <div className="text-xs text-gray-400 p-3 text-center">No matches.</div>}
          </div>
          <button onClick={() => { setSelected({ id: null, name: 'Custom item' }) }} className="text-xs text-blue-600 hover:text-blue-700">
            + Add a custom item instead
          </button>
        </>
      ) : (
        <div className="space-y-3 bg-white rounded-lg p-3 border border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-900">{selected.name}</div>
            <button onClick={() => setSelected(null)} className="text-xs text-blue-600">Change</button>
          </div>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Description"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min="1"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              placeholder="Quantity"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="url"
              value={form.reference_url}
              onChange={(e) => setForm((f) => ({ ...f, reference_url: e.target.value }))}
              placeholder="Reference URL (optional)"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            placeholder="Briefing notes (what to design, branding direction, etc.)"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</div>}
          <div className="flex gap-2 justify-end">
            <SecondaryButton onClick={() => setOpen(false)} disabled={submitting}>Cancel</SecondaryButton>
            <PrimaryButton onClick={submit} disabled={submitting || !form.description.trim()}>
              {submitting ? 'Adding…' : 'Add & create design brief'}
            </PrimaryButton>
          </div>
          <p className="text-xs text-gray-500">Adding an item also creates a design brief for our team.</p>
        </div>
      )}
    </div>
  )
}
