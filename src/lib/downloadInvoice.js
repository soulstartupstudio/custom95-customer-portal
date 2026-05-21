import { supabase } from './supabase'

/**
 * Trigger a browser download of a Moneybird invoice PDF.
 * Backed by the `moneybird` edge function (action: download_invoice_pdf),
 * which authorises portal users against their own company's invoice.
 *
 * Returns { ok: true } on success; throws Error on failure.
 * If the function returns a `redirect_url` (final fallback), this opens it in a new tab.
 */
// Strip any internal-tooling references before surfacing errors to the customer.
const scrub = (msg) => String(msg || '')
  .replace(/Moneybird/gi, 'our billing system')
  .replace(/moneybird/gi, 'our billing system')

export async function downloadInvoicePdf(invoiceId) {
  const { data, error } = await supabase.functions.invoke('moneybird', {
    body: { action: 'download_invoice_pdf', invoice_id: invoiceId },
  })
  if (error) throw new Error(scrub(error.message) || 'Download failed')
  if (data?.error) throw new Error(scrub(data.error))

  // If the function couldn't fetch the binary (very rare), just fail loudly —
  // we don't want to leak the internal billing-system URL to customers.
  if (!data?.base64) throw new Error('Invoice PDF is not available yet. Please try again later.')

  // Decode base64 → Blob → trigger download
  const bin = atob(data.base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const blob = new Blob([bytes], { type: data.content_type || 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = data.filename || `invoice-${invoiceId}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { ok: true }
}
