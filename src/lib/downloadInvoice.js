import { supabase } from './supabase'

/**
 * Trigger a browser download of a Moneybird invoice PDF.
 * Backed by the `moneybird` edge function (action: download_invoice_pdf),
 * which authorises portal users against their own company's invoice.
 *
 * Returns { ok: true } on success; throws Error on failure.
 * If the function returns a `redirect_url` (final fallback), this opens it in a new tab.
 */
export async function downloadInvoicePdf(invoiceId) {
  const { data, error } = await supabase.functions.invoke('moneybird', {
    body: { action: 'download_invoice_pdf', invoice_id: invoiceId },
  })
  if (error) throw new Error(error.message || 'Download failed')
  if (data?.error) throw new Error(data.error)

  // Final fallback: function couldn't fetch the binary, returned the MB URL
  if (data?.redirect_url) {
    window.open(data.redirect_url, '_blank', 'noopener,noreferrer')
    return { ok: true, redirected: true }
  }

  if (!data?.base64) throw new Error('No PDF returned')

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
