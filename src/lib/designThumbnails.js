import { supabase } from './supabase'

/**
 * Given an array of design_task ids, return a map: { [designId]: signedUrl }
 * Picks the latest mockup file (file_type='mockup', highest version) per design
 * and batch-signs URLs grouped by storage bucket.
 */
export async function fetchDesignMockupUrls(designIds) {
  const ids = Array.from(new Set(designIds.filter(Boolean)))
  if (ids.length === 0) return {}

  const { data: files, error } = await supabase
    .from('design_files')
    .select('design_task_id, file_url, version, storage_bucket')
    .in('design_task_id', ids)
    .eq('file_type', 'mockup')
    .order('version', { ascending: false })

  if (error || !files?.length) return {}

  const latest = {}
  for (const f of files) if (!latest[f.design_task_id]) latest[f.design_task_id] = f

  // Group by bucket and batch-sign
  const byBucket = {}
  for (const f of Object.values(latest)) {
    const bucket = f.storage_bucket || 'designs'
    ;(byBucket[bucket] = byBucket[bucket] || []).push(f)
  }

  const result = {}
  for (const [bucket, list] of Object.entries(byBucket)) {
    const paths = list.map((f) => f.file_url)
    const { data: signed } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 60)
    const byPath = Object.fromEntries((signed ?? []).filter((s) => !s.error).map((s) => [s.path, s.signedUrl]))
    for (const f of list) {
      const url = byPath[f.file_url]
      if (url) result[f.design_task_id] = url
    }
  }
  return result
}

/**
 * Sign a single design_file's stored path (used by DesignDrawer version list).
 */
export async function signDesignFileUrl(file) {
  if (!file?.file_url) return null
  const bucket = file.storage_bucket || 'designs'
  const { data } = await supabase.storage.from(bucket).createSignedUrl(file.file_url, 60 * 60)
  return data?.signedUrl || null
}
