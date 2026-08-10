#!/usr/bin/env node
// One-off uploader for monthly brandshop report PDFs.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
//     node scripts/upload-brandshop-reports.mjs --shop check --dir ~/Downloads
//
// - Finds the brandshop whose name/domain matches --shop (ilike).
// - Picks up files named like "<Shop>-Report-<Month><Year>*.pdf"
//   (e.g. "Check-Report-June2026 (1).pdf").
// - Uploads each to the private `brandshop-reports` bucket, creates a
//   20-year signed URL (same pattern as other portal file links), and
//   upserts a row in brandshop_reports.
// The service key stays in your shell env — never commit or paste it anywhere.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qhgdmdtqssjylfwetpna.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY in the environment.'); process.exit(1) }

const args = process.argv.slice(2)
const argVal = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}
const shopQuery = argVal('shop', 'check')
const dir = argVal('dir', join(homedir(), 'Downloads')).replace(/^~(?=\/)/, homedir())

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december']
const supabase = createClient(SUPABASE_URL, KEY)

const { data: shops, error: shopErr } = await supabase
  .from('brandshops')
  .select('id, shop_name, shop_domain, company_id')
  .or(`shop_name.ilike.%${shopQuery}%,shop_domain.ilike.%${shopQuery}%`)
if (shopErr) { console.error('Could not query brandshops:', shopErr.message); process.exit(1) }
if (!shops?.length) { console.error(`No brandshop matches "${shopQuery}".`); process.exit(1) }
if (shops.length > 1) {
  console.error(`Multiple shops match "${shopQuery}":`, shops.map((s) => s.shop_name || s.shop_domain).join(', '))
  process.exit(1)
}
const shop = shops[0]
console.log(`Shop: ${shop.shop_name || shop.shop_domain} (${shop.id})`)

const fileRe = /-report-([a-z]+)[\s-]*(\d{4}).*\.pdf$/i
const files = readdirSync(dir).filter((f) => fileRe.test(f) && f.toLowerCase().includes(shopQuery.toLowerCase()))
if (!files.length) { console.error(`No matching "<shop>-Report-<Month><Year>*.pdf" files in ${dir}`); process.exit(1) }

for (const f of files.sort()) {
  const m = f.match(fileRe)
  const monthIdx = MONTHS.indexOf(m[1].toLowerCase())
  if (monthIdx === -1) { console.warn(`skip ${f} — unknown month "${m[1]}"`); continue }
  const year = Number(m[2])
  const periodStart = `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`
  const periodLabel = `${MONTHS[monthIdx][0].toUpperCase()}${MONTHS[monthIdx].slice(1)} ${year}`
  const path = `${shop.id}/${periodStart.slice(0, 7)}.pdf`
  const bytes = readFileSync(join(dir, f))

  const { error: upErr } = await supabase.storage.from('brandshop-reports')
    .upload(path, bytes, { contentType: 'application/pdf', upsert: true })
  if (upErr) { console.error(`upload failed for ${f}:`, upErr.message); process.exit(1) }

  const { data: signed, error: signErr } = await supabase.storage.from('brandshop-reports')
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 20) // ~20 years, same style as other portal file links
  if (signErr) { console.error(`sign failed for ${f}:`, signErr.message); process.exit(1) }

  const { error: rowErr } = await supabase.from('brandshop_reports').upsert({
    brandshop_id: shop.id,
    period_start: periodStart,
    period_label: periodLabel,
    pdf_url: signed.signedUrl,
    file_size_bytes: statSync(join(dir, f)).size,
  }, { onConflict: 'brandshop_id,period_start' })
  if (rowErr) { console.error(`row insert failed for ${f}:`, rowErr.message); process.exit(1) }

  console.log(`✓ ${periodLabel}  ←  ${f}`)
}
console.log('Done.')
