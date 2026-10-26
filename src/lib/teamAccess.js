// Team access (26 Oct 2026): Growth / Scale / Enterprise customers can give team members
// warehouse-only access — a chosen set of warehouse items, each with an optional total allowance,
// and nothing else in the portal. Enforced in the database (portal_team_access migration in the
// team app); this file is the portal side.
import { supabase } from './supabase'

export const TEAM_ACCESS_TIERS = ['growth', 'scale', 'enterprise']
export const hasTeamAccess = (company) => TEAM_ACCESS_TIERS.includes(company?.plan_tier)
export const isWarehouseOnly = (contact) => contact?.portal_role === 'warehouse'

// { inventory_id: { allowance, used, left, deptAllowance, deptUsed, deptLeft, left } } for one team
// member. `left` = what they can still order: the smaller of their personal and their
// department's remaining allowance (null = no cap). Department allowances share an item with
// everyone in the department (one pool).
const remaining = (cap, used) => (cap == null ? null : Math.max(cap - (used ?? 0), 0))
export async function loadAllowances(contactId) {
  const { data, error } = await supabase.rpc('portal_item_usage', { p_contact_id: contactId })
  if (error) throw error
  return Object.fromEntries((data || []).map((r) => {
    const own = remaining(r.allowance_qty, r.used_qty)
    const dept = remaining(r.department_allowance_qty, r.department_used_qty)
    return [r.inventory_id, {
      personal: !!r.personal,
      allowance: r.allowance_qty, used: r.used_qty ?? 0, ownLeft: own,
      deptAllowance: r.department_allowance_qty, deptUsed: r.department_used_qty ?? 0, deptLeft: dept,
      left: own == null ? dept : dept == null ? own : Math.min(own, dept),
    }]
  }))
}

// What a warehouse-only member can still order: stock, capped by what's left of their allowance.
export function withAllowances(items, allowances) {
  return (items || []).map((i) => {
    const a = allowances?.[i.id]
    if (!a) return i
    return {
      ...i,
      shared: true,   // shared with this member (others are only visible via a colleague's order)
      allowance_qty: a.allowance, allowance_used: a.used, allowance_left: a.ownLeft,
      dept_allowance_qty: a.deptAllowance, dept_allowance_left: a.deptLeft,
      available_qty: a.left == null ? i.available_qty : Math.min(i.available_qty ?? 0, a.left),
    }
  })
}
