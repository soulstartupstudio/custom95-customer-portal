import { useEffect, useMemo, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Upload, FileText, Trash2, Pencil, X, Check, Tag } from 'lucide-react'
import { formatDate, PrimaryButton, SecondaryButton, Badge } from './ui'

const ASSET_TYPES = ['logo', 'font', 'guidelines', 'photo', 'other']

// --- Reusable chip input for labels ---
function LabelInput({ value, onChange, placeholder = 'Add label…' }) {
  const [draft, setDraft] = useState('')
  const commit = () => {
    const parts = draft.split(',').map((s) => s.trim()).filter(Boolean)
    if (!parts.length) return
    const next = [...value]
    for (const p of parts) if (!next.includes(p)) next.push(p)
    onChange(next)
    setDraft('')
  }
  const remove = (label) => onChange(value.filter((v) => v !== label))
  return (
    <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500">
      {value.map((label) => (
        <span key={label} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
          {label}
          <button onClick={() => remove(label)} className="text-blue-400 hover:text-blue-700"><X size={10} /></button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit() }
          if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={commit}
        placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[80px] text-xs px-1 py-0.5 outline-none bg-transparent"
      />
    </div>
  )
}

// --- Edit modal ---
function EditModal({ asset, onClose, onSaved }) {
  const [name, setName] = useState(asset.name || asset.file_name || '')
  const [assetType, setAssetType] = useState(asset.asset_type || 'other')
  const [labels, setLabels] = useState(asset.labels || [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const save = async () => {
    setBusy(true); setError(null)
    const { error: err } = await supabase
      .from('brand_assets')
      .update({ name: name.trim() || asset.file_name, asset_type: assetType, labels })
      .eq('id', asset.id)
    setBusy(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Edit asset</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Type</label>
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1"><Tag size={11} />Labels</label>
            <LabelInput value={labels} onChange={setLabels} />
            <p className="text-[10px] text-gray-400 mt-1">Press Enter or comma to add. Backspace to remove the last.</p>
          </div>
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</div>}
        </div>
        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
          <SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
          <PrimaryButton onClick={save} disabled={busy}><Check size={14} />{busy ? 'Saving…' : 'Save'}</PrimaryButton>
        </div>
      </div>
    </div>
  )
}

export default function BrandAssetsSection({ company, contact }) {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [assetType, setAssetType] = useState('logo')
  const [draftLabels, setDraftLabels] = useState([])
  const [editing, setEditing] = useState(null)
  const [labelFilter, setLabelFilter] = useState(null)
  const fileRef = useRef(null)

  const loadAssets = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('brand_assets')
      .select('id, asset_type, name, file_name, mime_type, file_size, storage_path, labels, created_at')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
    setAssets(data ?? [])
    setLoading(false)
  }

  useEffect(() => { if (company?.id) loadAssets() }, [company?.id])

  const signedUrl = async (path) => {
    const { data } = await supabase.storage.from('brand-assets').createSignedUrl(path, 60 * 60)
    return data?.signedUrl
  }

  const upload = async (file) => {
    if (!file || !contact) return
    setUploading(true); setError(null)
    const ext = file.name.split('.').pop()
    const path = `${company.id}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from('brand-assets').upload(path, file, {
      contentType: file.type,
      upsert: false,
    })
    if (upErr) { setError(upErr.message); setUploading(false); return }

    const { error: insErr } = await supabase.from('brand_assets').insert({
      company_id: company.id,
      asset_type: assetType,
      name: file.name,
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
      storage_path: path,
      uploaded_by: null,
      portal_visible: true,
      labels: draftLabels,
    })
    setUploading(false)
    if (insErr) { setError(insErr.message); return }
    setDraftLabels([]) // reset for next upload
    await loadAssets()
    if (fileRef.current) fileRef.current.value = ''
  }

  const deleteAsset = async (asset) => {
    setError(null)
    // Storage first, then DB row. If storage fails we still try DB so orphans don't accumulate.
    await supabase.storage.from('brand-assets').remove([asset.storage_path])
    const { error: err } = await supabase.from('brand_assets').delete().eq('id', asset.id)
    if (err) { setError(err.message); return }
    await loadAssets()
  }

  const isImage = (mime) => mime?.startsWith('image/')

  // Collect all distinct labels across assets for the filter row
  const allLabels = useMemo(() => {
    const set = new Set()
    for (const a of assets) (a.labels || []).forEach((l) => set.add(l))
    return Array.from(set).sort()
  }, [assets])

  const filtered = labelFilter ? assets.filter((a) => (a.labels || []).includes(labelFilter)) : assets

  return (
    <div>
      {/* Upload row */}
      <div className="border border-gray-200 rounded-xl p-3 bg-gray-50/40 mb-4 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs font-semibold text-gray-700">Upload new asset</div>
          <div className="flex items-center gap-2">
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <label className={`inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-blue-700 ${uploading ? 'opacity-50' : ''}`}>
              <Upload size={12} />{uploading ? 'Uploading…' : 'Upload'}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                disabled={uploading}
                onChange={(e) => upload(e.target.files?.[0])}
              />
            </label>
          </div>
        </div>
        <LabelInput value={draftLabels} onChange={setDraftLabels} placeholder="Add labels for the next upload (optional)…" />
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2 mb-3">{error}</div>}

      {/* Label filter bar */}
      {allLabels.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="text-xs text-gray-500 inline-flex items-center gap-1"><Tag size={11} />Filter:</div>
          <button
            onClick={() => setLabelFilter(null)}
            className={`px-2 py-0.5 text-xs rounded-full ring-1 ring-inset ${!labelFilter ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'}`}
          >
            All ({assets.length})
          </button>
          {allLabels.map((l) => {
            const count = assets.filter((a) => (a.labels || []).includes(l)).length
            const active = labelFilter === l
            return (
              <button
                key={l}
                onClick={() => setLabelFilter(active ? null : l)}
                className={`px-2 py-0.5 text-xs rounded-full ring-1 ring-inset ${active ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-blue-700 ring-blue-200 hover:bg-blue-50'}`}
              >
                {l} ({count})
              </button>
            )
          })}
        </div>
      )}

      {loading ? (
        <div className="text-xs text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-lg">
          {assets.length === 0 ? 'No brand assets yet. Upload your logo to get started.' : 'No assets match this label.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((a) => (
            <AssetTile
              key={a.id}
              asset={a}
              signedUrl={signedUrl}
              isImage={isImage}
              onEdit={() => setEditing(a)}
              onDelete={() => {
                if (confirm(`Delete "${a.name}"? This removes it from storage and any designs it's attached to.`)) {
                  deleteAsset(a)
                }
              }}
            />
          ))}
        </div>
      )}

      {editing && (
        <EditModal
          asset={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadAssets() }}
        />
      )}
    </div>
  )
}

function AssetTile({ asset, signedUrl, isImage, onEdit, onDelete }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let cancelled = false
    signedUrl(asset.storage_path).then((u) => { if (!cancelled) setUrl(u) })
    return () => { cancelled = true }
  }, [asset.storage_path])

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden hover:border-blue-300 transition-colors bg-white group relative">
      <a
        href={url || '#'}
        target="_blank"
        rel="noreferrer"
        className="block"
      >
        <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
          {isImage(asset.mime_type) && url ? (
            <img src={url} alt={asset.name} className="w-full h-full object-contain" />
          ) : (
            <FileText size={24} className="text-gray-300" />
          )}
        </div>
      </a>
      <div className="p-2">
        <div className="text-xs font-medium text-gray-900 truncate">{asset.name}</div>
        <div className="text-[10px] text-gray-400 truncate">{asset.asset_type} · {formatDate(asset.created_at)}</div>
        {(asset.labels || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {asset.labels.map((l) => (
              <span key={l} className="text-[9px] font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full truncate max-w-full">{l}</span>
            ))}
          </div>
        )}
      </div>

      {/* Hover actions */}
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="w-6 h-6 rounded-full bg-white/95 shadow-sm hover:bg-blue-50 text-gray-600 hover:text-blue-600 flex items-center justify-center"
          title="Edit"
        >
          <Pencil size={11} />
        </button>
        <button
          onClick={onDelete}
          className="w-6 h-6 rounded-full bg-white/95 shadow-sm hover:bg-red-50 text-gray-600 hover:text-red-600 flex items-center justify-center"
          title="Delete"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}
