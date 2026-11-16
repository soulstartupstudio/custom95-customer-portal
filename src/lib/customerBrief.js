// The design brief field is shared between the team and the customer. The portal
// no longer shows what is already in it (the team may have written internal or
// supplier details there), so what the customer types is added underneath the
// existing text instead of replacing it.
export const CUSTOMER_BRIEF_HEADER = 'Customer brief (from the portal):'

export function appendCustomerBrief(existing, text) {
  const add = (text || '').trim()
  const base = (existing || '').trim()
  if (!add) return base
  if (!base) return add
  return `${base}\n\n${CUSTOMER_BRIEF_HEADER}\n${add}`
}
