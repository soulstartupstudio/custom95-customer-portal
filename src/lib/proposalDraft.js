// Local-only "proposal in progress" persistence.
// Mirrors the team-app widget: if the customer closes the wizard mid-flight
// we keep their form state in localStorage so they can resume from the
// floating widget.
//
// One draft per company (keyed by company.id) so a teammate switching
// browsers/devices doesn't accidentally overwrite — each user has their
// own browser copy.

const KEY = (companyId) => `custom95-portal-proposal-draft-${companyId || 'default'}`
const VERSION = 1

export function saveProposalDraft(companyId, draft) {
  if (!companyId) return
  try {
    const payload = {
      version: VERSION,
      saved_at: new Date().toISOString(),
      company_id: companyId,
      ...draft,
    }
    localStorage.setItem(KEY(companyId), JSON.stringify(payload))
  } catch (_) { /* quota / private mode — ignore */ }
}

export function readProposalDraft(companyId) {
  if (!companyId) return null
  try {
    const raw = localStorage.getItem(KEY(companyId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.version !== VERSION) return null
    return parsed
  } catch (_) { return null }
}

export function clearProposalDraft(companyId) {
  if (!companyId) return
  try { localStorage.removeItem(KEY(companyId)) } catch (_) { /* ignore */ }
}

// Heuristic: is this draft worth saving / showing in the widget?
export function isDraftMeaningful(draft) {
  if (!draft) return false
  if ((draft.items?.length ?? 0) > 0) return true
  if (draft.step > 0) return true
  if (draft.form?.name?.trim?.()) return true
  if (draft.form?.brief_notes?.trim?.()) return true
  return false
}
