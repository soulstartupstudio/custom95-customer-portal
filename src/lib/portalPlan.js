import { supabase } from './supabase'
import { auditPayload } from './merchAudit'

// The signed-in customer's Plan, Getting Started steps and Merch Audit (portal-plan function).
export async function fetchPortalPlan() {
  const { data, error } = await supabase.functions.invoke('portal-plan', { method: 'GET' })
  if (error || !data?.ok) throw new Error(data?.error || error?.message || 'Could not load your Plan')
  return data
}

export async function submitMerchAudit(values) {
  const { data, error } = await supabase.functions.invoke('portal-plan', { body: { action: 'merch_audit', answers: auditPayload(values) } })
  if (error || !data?.ok) throw new Error(data?.error || error?.message || 'Could not submit the Merch Audit')
  return data
}
