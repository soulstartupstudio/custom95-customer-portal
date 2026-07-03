import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Palette, Upload, Check, Image as ImageIcon } from 'lucide-react'
import { PrimaryButton, SecondaryButton } from './ui'

// Shown immediately after a customer approves their quote. Captures ONE combined
// design brief (how they want it to look) plus an optional logo/asset upload, and
// applies it to every design task on the proposal so our creatives can start.
export default function DesignBriefModal({ proposalId, company, contact, onClose }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [instructions, setInstructions] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('design_tasks')
        .select('id, status, brief_notes')
        .eq('proposal_id', proposalId)
        .neq('status', 'approved')
      if (cancelled) return
      const rows = data ?? []
      setTasks(rows)
      const existing = rows.find((t) => t.brief_notes?.trim())?.brief_notes
      if (existing) setInstructions(existing)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [proposalId])

  const canSave = instructions.trim().length > 0 || !!file

  const save = async () => {
    setBusy(true); setError(null)
    try {
      const brief = instructions.trim()

      // 1. Optional logo/asset upload → company brand library.
      let brandAssetId = null
      if (file) {
        const ext = file.name.split('.').pop()
        const path = `${company.id}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage.from('brand-assets').upload(path, file, { contentType: file.type })
        if (upErr) throw upErr
        const { data: asset, error: insErr } = await supabase.from('brand_assets').insert({
          company_id: company.id, asset_type: 'logo',
          name: file.name, file_name: file.name, mime_type: file.type, file_size: file.size,
          storage_path: path, portal_visible: true,
        }).select('id').single()
        if (insErr) throw insErr
        brandAssetId = asset?.id || null
      }

      // 2. Apply the combined brief to every design task on the proposal, advancing
      //    any that are still awaiting a brief, and attach the uploaded logo.
      for (const t of tasks) {
        const patch = {}
        if (brief) patch.brief_notes = brief
        if (t.status === 'awaiting_brief') patch.status = 'in_progress'
        if (Object.keys(patch).length) {
          const { error: uErr } = await supabase.from('design_tasks').update(patch).eq('id', t.id)
          if (uErr) throw uErr
        }
        if (brandAssetId) {
          await supabase.from('design_task_assets').insert({
            design_task_id: t.id, brand_asset_id: brandAssetId,
            company_id: company.id, attached_by_contact_id: contact.id,
          })
        }
      }

      // Fallback: if there are no design tasks yet, don't lose the brief — log it.
      if (tasks.length === 0 && brief) {
        await supabase.from('comments').insert({
          company_id: company.id, entity_type: 'proposal', entity_id: proposalId,
          author_contact_id: contact.id, author_name: contactName,
          body: `🎨 Design brief:\n\n${brief}`,
        })
      }

      setBusy(false)
      onClose()
    } catch (e) {
      setBusy(false)
      setError(e.message || 'Could not save your brief. Please try again.')
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white sm:rounded-xl shadow-xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Palette size={18} className="text-blue-600" />Quote approved 🎉
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Tell us how you'd like your design to look — our Creatives take it from here.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {loading ? (
            <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">How should it look?</label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={6}
                  placeholder="Brand tone, colours, must-haves, placement, references, dos and don'ts…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Upload your logo <span className="text-xs font-normal text-gray-400">(optional)</span></label>
                {file ? (
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <ImageIcon size={14} />
                    <span className="truncate flex-1">{file.name}</span>
                    <button onClick={() => setFile(null)} className="text-gray-400 hover:text-red-600"><X size={14} /></button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 cursor-pointer transition-colors">
                    <Upload size={14} />Choose a file
                    <input type="file" accept="image/*,.pdf,.svg,.ai,.eps" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  </label>
                )}
                <p className="text-[10px] text-gray-400 mt-1">Added to your brand library and attached to this design.</p>
              </div>

              {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</div>}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <SecondaryButton onClick={onClose} disabled={busy}>Skip for now</SecondaryButton>
          <PrimaryButton onClick={save} disabled={!canSave || busy || loading}>
            <Check size={14} />{busy ? 'Saving…' : 'Send brief to Creatives'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}
