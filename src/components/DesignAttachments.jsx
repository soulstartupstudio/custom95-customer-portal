import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Paperclip, Plus, X, Upload, FileText, Check } from 'lucide-react'

/**
 * Shows brand assets attached to a specific design_task.
 * User can add/remove attachments; additions write to design_task_assets.
 * Picker draws from the company-wide brand_assets library.
 */
export default function DesignAttachments({ design, company, contact }) {
  const [attached, setAttached] = useState([]) // [{ id, brand_asset_id, brand_asset, signed_url }]
  const [library, setLibrary] = useState([])
  const [librarySigned, setLibrarySigned] = useState({})
  const [picking, setPicking] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const signedUrl = async (path) => {
    const { data } = await supabase.storage.from('brand-assets').createSignedUrl(path, 60 * 60)
    return data?.signedUrl || null
  }

  const loadAttached = async () => {
    const { data } = await supabase
      .from('design_task_assets')
      .select('id, brand_asset_id, brand_assets(id, name, asset_type, mime_type, storage_path)')
      .eq('design_task_id', design.id)
    const rows = data ?? []
    const withUrls = await Promise.all(
      rows.map(async (r) => ({ ...r, signed_url: r.brand_assets ? await signedUrl(r.brand_assets.storage_path) : null }))
    )
    setAttached(withUrls)
  }

  const loadLibrary = async () => {
    const { data } = await supabase
      .from('brand_assets')
      .select('id, name, asset_type, mime_type, storage_path, created_at')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
    const rows = data ?? []
    setLibrary(rows)
    const sigs = {}
    await Promise.all(rows.map(async (r) => {
      sigs[r.id] = await signedUrl(r.storage_path)
    }))
    setLibrarySigned(sigs)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([loadAttached(), loadLibrary()]).then(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [design.id, company.id])

  const attach = async (brandAssetId) => {
    if (attached.some((a) => a.brand_asset_id === brandAssetId)) return
    setError(null)
    const { error: err } = await supabase.from('design_task_assets').insert({
      design_task_id: design.id,
      brand_asset_id: brandAssetId,
      company_id: company.id,
      attached_by_contact_id: contact.id,
    })
    if (err) { setError(err.message); return }
    await loadAttached()
  }

  const detach = async (attachmentId) => {
    setError(null)
    const { error: err } = await supabase.from('design_task_assets').delete().eq('id', attachmentId)
    if (err) { setError(err.message); return }
    await loadAttached()
  }

  const uploadNew = async (file) => {
    if (!file) return
    setUploading(true); setError(null)
    const ext = file.name.split('.').pop()
    const path = `${company.id}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from('brand-assets').upload(path, file, { contentType: file.type })
    if (upErr) { setError(upErr.message); setUploading(false); return }
    const { data: inserted, error: insErr } = await supabase.from('brand_assets').insert({
      company_id: company.id,
      asset_type: 'other',
      name: file.name, file_name: file.name, mime_type: file.type, file_size: file.size,
      storage_path: path, portal_visible: true,
    }).select().single()
    if (insErr) { setError(insErr.message); setUploading(false); return }
    await loadLibrary()
    if (inserted) await attach(inserted.id)
    setUploading(false)
  }

  const attachedIds = new Set(attached.map((a) => a.brand_asset_id))
  const available = library.filter((l) => !attachedIds.has(l.id))

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Paperclip size={14} className="text-gray-400" />Attached to this design
          {attached.length > 0 && <span className="text-xs text-gray-400 font-normal">· {attached.length}</span>}
        </div>
        {!picking && (
          <button
            onClick={() => setPicking(true)}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
          >
            <Plus size={12} />Attach
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-xs text-gray-400">Loading…</div>
      ) : attached.length === 0 && !picking ? (
        <div className="text-xs text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded">
          Nothing attached yet. Upload a logo or pick from your brand library.
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {attached.map((a) => {
            const ba = a.brand_assets
            if (!ba) return null
            const isImg = ba.mime_type?.startsWith('image/')
            return (
              <div key={a.id} className="relative border border-gray-200 rounded-lg overflow-hidden group">
                <div className="aspect-square bg-gray-50 flex items-center justify-center">
                  {isImg && a.signed_url ? (
                    <img src={a.signed_url} alt={ba.name} className="w-full h-full object-contain" />
                  ) : (
                    <FileText size={16} className="text-gray-300" />
                  )}
                </div>
                <div className="px-1.5 py-1 text-[10px] text-gray-700 truncate bg-white">{ba.name}</div>
                <button
                  onClick={() => detach(a.id)}
                  className="absolute top-1 right-1 w-5 h-5 bg-white/90 hover:bg-red-50 text-gray-500 hover:text-red-600 rounded-full flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove attachment"
                >
                  <X size={11} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {picking && (
        <div className="mt-3 border border-blue-200 bg-blue-50/30 rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-gray-900">Pick from your brand library</div>
            <div className="flex items-center gap-2">
              <label className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 cursor-pointer hover:bg-blue-100 rounded ${uploading ? 'opacity-50' : ''}`}>
                <Upload size={11} />{uploading ? 'Uploading…' : 'Upload new'}
                <input type="file" className="hidden" disabled={uploading} onChange={(e) => uploadNew(e.target.files?.[0])} />
              </label>
              <button onClick={() => setPicking(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
            </div>
          </div>

          {available.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-3">
              {library.length === 0 ? 'No assets in your library yet. Upload one above.' : 'Everything in your library is already attached.'}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto">
              {available.map((l) => {
                const isImg = l.mime_type?.startsWith('image/')
                const url = librarySigned[l.id]
                return (
                  <button
                    key={l.id}
                    onClick={() => attach(l.id)}
                    className="border border-gray-200 rounded-lg overflow-hidden hover:border-blue-500 hover:ring-2 hover:ring-blue-200 transition-all bg-white"
                  >
                    <div className="aspect-square bg-gray-50 flex items-center justify-center">
                      {isImg && url ? (
                        <img src={url} alt={l.name} className="w-full h-full object-contain" />
                      ) : (
                        <FileText size={16} className="text-gray-300" />
                      )}
                    </div>
                    <div className="px-1.5 py-1 text-[10px] text-gray-700 truncate">{l.name}</div>
                  </button>
                )
              })}
            </div>
          )}

          <p className="text-[10px] text-gray-500">Manage your full library in <span className="font-medium text-gray-700">Settings → Brand assets</span>.</p>
        </div>
      )}

      {error && <div className="text-xs text-red-600 bg-red-50 rounded p-2 mt-2">{error}</div>}
    </div>
  )
}
