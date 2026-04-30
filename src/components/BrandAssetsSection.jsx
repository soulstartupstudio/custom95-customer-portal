import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Upload, Image as ImageIcon, FileText, Trash2 } from 'lucide-react'
import { formatDate } from './ui'

const ASSET_TYPES = ['logo', 'font', 'guidelines', 'photo', 'other']

export default function BrandAssetsSection({ company, contact }) {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [assetType, setAssetType] = useState('logo')
  const fileRef = useRef(null)

  const loadAssets = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('brand_assets')
      .select('id, asset_type, name, file_name, mime_type, file_size, storage_path, created_at')
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
    setUploading(true)
    setError(null)
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
    })
    setUploading(false)
    if (insErr) { setError(insErr.message); return }
    await loadAssets()
    if (fileRef.current) fileRef.current.value = ''
  }

  const isImage = (mime) => mime?.startsWith('image/')

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-gray-900">Brand assets</div>
        <div className="flex items-center gap-2">
          <select
            value={assetType}
            onChange={(e) => setAssetType(e.target.value)}
            className="text-xs border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2 mb-3">{error}</div>}

      {loading ? (
        <div className="text-xs text-gray-400">Loading…</div>
      ) : assets.length === 0 ? (
        <div className="text-sm text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-lg">
          No brand assets yet. Upload your logo to get started.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {assets.map((a) => (
            <AssetTile key={a.id} asset={a} signedUrl={signedUrl} isImage={isImage} />
          ))}
        </div>
      )}
    </div>
  )
}

function AssetTile({ asset, signedUrl, isImage }) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    let cancelled = false
    signedUrl(asset.storage_path).then((u) => { if (!cancelled) setUrl(u) })
    return () => { cancelled = true }
  }, [asset.storage_path])

  return (
    <a
      href={url || '#'}
      target="_blank"
      rel="noreferrer"
      className="border border-gray-200 rounded-lg overflow-hidden hover:border-blue-300 transition-colors block"
    >
      <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
        {isImage(asset.mime_type) && url ? (
          <img src={url} alt={asset.name} className="w-full h-full object-contain" />
        ) : (
          <FileText size={24} className="text-gray-300" />
        )}
      </div>
      <div className="p-2">
        <div className="text-xs font-medium text-gray-900 truncate">{asset.name}</div>
        <div className="text-[10px] text-gray-400 truncate">{asset.asset_type} · {formatDate(asset.created_at)}</div>
      </div>
    </a>
  )
}
