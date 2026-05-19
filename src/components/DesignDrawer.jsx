import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  X, Image as ImageIcon, Check, MessageSquare, RotateCcw, FileText, Clock,
  Lock, Maximize2,
} from 'lucide-react'
import { StatusBadge, formatDate, PrimaryButton, SecondaryButton, Badge } from './ui'
import DesignAttachments from './DesignAttachments'
import { signDesignFileUrl } from '../lib/designThumbnails'

export default function DesignDrawer({ design, company, contact, onClose, onUpdated }) {
  const [files, setFiles] = useState([]) // ALL design_files, signed
  const [feedback, setFeedback] = useState('')
  const [mode, setMode] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [briefDraft, setBriefDraft] = useState(design.brief_notes || '')
  const [submittingBrief, setSubmittingBrief] = useState(false)
  const [hero, setHero] = useState(null)
  const [heroIsMockup, setHeroIsMockup] = useState(false)
  const [lightbox, setLightbox] = useState(null)

  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ')
  const isAwaitingBrief = design.status === 'awaiting_brief'
  const isInProgress = design.status === 'in_progress'
  const isSubmitted = design.status === 'submitted'
  const isRevisionRequested = design.status === 'revision_requested'
  const isApproved = design.status === 'approved'

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: raw } = await supabase
        .from('design_files')
        .select('id, file_url, file_type, version, notes, created_at, storage_bucket')
        .eq('design_task_id', design.id)
        .order('version', { ascending: false })
      if (cancelled) return

      // Sign every file (mockups, logos, assets)
      const signed = await Promise.all((raw ?? []).map(async (f) => ({
        ...f,
        signed_url: await signDesignFileUrl(f),
      })))
      if (cancelled) return
      setFiles(signed)

      // Hero: latest signed mockup, else fall back to reference / catalogue / existing latest_file_url
      const latestMockup = signed.find((s) => s.file_type === 'mockup' && s.signed_url)
      if (latestMockup) {
        setHero(latestMockup.signed_url)
        setHeroIsMockup(true)
        return
      }
      setHeroIsMockup(false)

      if (design.proposal_requested_item_id) {
        const { data } = await supabase
          .from('proposal_requested_items')
          .select('reference_url, catalogue_item_id, catalogue_items(main_photo_url)')
          .eq('id', design.proposal_requested_item_id)
          .single()
        if (!cancelled) {
          setHero(design.latest_file_url || data?.reference_url || data?.catalogue_items?.main_photo_url || null)
        }
      } else {
        setHero(design.latest_file_url || null)
      }
    })()
    return () => { cancelled = true }
  }, [design.id])

  // Split files for display
  const mockups = useMemo(() => files.filter((f) => f.file_type === 'mockup'), [files])
  const teamAssets = useMemo(() => files.filter((f) => f.file_type === 'logo' || f.file_type === 'asset'), [files])
  const latestMockup = mockups[0]
  const olderMockups = mockups.slice(1)

  const submitBrief = async () => {
    setSubmittingBrief(true); setError(null)
    const { error: err } = await supabase
      .from('design_tasks')
      .update({ brief_notes: briefDraft.trim(), status: 'in_progress' })
      .eq('id', design.id)
    setSubmittingBrief(false)
    if (err) { setError(err.message); return }
    onUpdated?.(); onClose()
  }

  const approve = async () => {
    setBusy(true); setError(null)
    const { error: err } = await supabase.from('design_tasks').update({
      status: 'approved',
      client_approved_at: new Date().toISOString(),
      client_approved_by_name: contactName,
      client_feedback: feedback.trim() || null,
    }).eq('id', design.id)
    setBusy(false)
    if (err) { setError(err.message); return }
    onUpdated?.(); onClose()
  }

  const requestRevision = async (strong = false) => {
    if (!feedback.trim()) { setError('Please leave feedback so we know what to change.'); return }
    setBusy(true); setError(null)
    const prefixed = strong ? `[Start over] ${feedback.trim()}` : feedback.trim()
    const { error: err } = await supabase.from('design_tasks').update({
      status: 'revision_requested',
      client_feedback: prefixed,
      revision_count: (design.revision_count ?? 0) + 1,
    }).eq('id', design.id)
    setBusy(false)
    if (err) { setError(err.message); return }
    onUpdated?.(); onClose()
  }

  return (
    <>
    <div className="fixed inset-0 z-50 bg-black/30 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <div className="text-xs text-gray-500 flex items-center gap-2">
              Design
              <StatusBadge status={design.status} />
              {design.revision_count > 0 && <span>· rev {design.revision_count}</span>}
              {design.context === 'pre_sale' && <Badge tone="purple">Pre-sale</Badge>}
            </div>
            <h2 className="text-lg font-semibold text-gray-900 truncate">{design.title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {/* HERO — large latest mockup */}
        <div className="px-6 pt-6">
          {hero ? (
            <button
              onClick={() => setLightbox(hero)}
              className="group relative w-full block rounded-xl overflow-hidden bg-gray-50 border border-gray-200"
            >
              <img
                src={hero}
                alt=""
                className="w-full max-h-[70vh] object-contain bg-gray-50"
                onError={(e) => { e.target.style.display = 'none' }}
              />
              <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Maximize2 size={14} className="text-gray-700" />
              </div>
              {!heroIsMockup && (
                <div className="absolute bottom-3 left-3 text-[10px] bg-black/60 text-white px-2 py-0.5 rounded-full">
                  Reference photo · mockup not uploaded yet
                </div>
              )}
              {heroIsMockup && latestMockup && (
                <div className="absolute bottom-3 left-3 text-[10px] bg-black/60 text-white px-2 py-0.5 rounded-full">
                  Latest mockup · v{latestMockup.version}
                </div>
              )}
            </button>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 py-20 text-center">
              <ImageIcon size={32} className="mx-auto text-gray-300 mb-1" />
              <div className="text-xs text-gray-500">No mockup uploaded yet</div>
            </div>
          )}
        </div>

        {/* PRIMARY ACTION SECTION */}
        <div className="px-6 py-5">
          {isApproved && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center flex-shrink-0">
                <Check size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-green-900 flex items-center gap-2">
                  Design approved
                  <Lock size={11} className="text-green-700" />
                </div>
                <div className="text-xs text-green-700">
                  by {design.client_approved_by_name || 'you'} on {formatDate(design.client_approved_at)} — locked, no further changes
                </div>
              </div>
            </div>
          )}

          {isAwaitingBrief && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
              <div>
                <div className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  <FileText size={14} />Finish your brief
                </div>
                <p className="text-xs text-gray-600">We'll start designing as soon as you submit. Add any logos & assets below first.</p>
              </div>
              <textarea
                value={briefDraft}
                onChange={(e) => setBriefDraft(e.target.value)}
                rows={5}
                placeholder="Design direction, brand tone, must-haves, references…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <div className="flex justify-end">
                <PrimaryButton onClick={submitBrief} disabled={submittingBrief || !briefDraft.trim()}>
                  {submittingBrief ? 'Submitting…' : 'Submit brief'}
                </PrimaryButton>
              </div>
              {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>}
            </div>
          )}

          {isInProgress && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 flex items-center gap-3">
              <Clock size={16} className="text-blue-600 flex-shrink-0" />
              <div className="text-sm text-blue-900">
                Our design team is working on this. You'll get a mockup here soon.
              </div>
            </div>
          )}

          {isRevisionRequested && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 flex items-start gap-3">
              <RotateCcw size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-amber-900 mb-1">Revision requested</div>
                <div className="text-xs text-amber-800">We're iterating on your feedback. Next version coming soon.</div>
                {design.client_feedback && (
                  <div className="text-xs text-gray-700 whitespace-pre-wrap mt-2 bg-white/60 rounded p-2">{design.client_feedback}</div>
                )}
              </div>
            </div>
          )}

          {isSubmitted && (
            <div>
              <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Your decision</div>
              {mode === 'revise' || mode === 'reject' ? (
                <div className="space-y-3 border border-gray-200 rounded-xl p-4 bg-gray-50/50">
                  <div className="text-xs text-gray-600">
                    {mode === 'revise' ? 'What should we adjust?' : 'What direction should we take instead?'}
                  </div>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={4}
                    placeholder="Tell us what to change…"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  <div className="flex gap-2 justify-end">
                    <SecondaryButton onClick={() => { setMode(null); setFeedback('') }} disabled={busy}>Cancel</SecondaryButton>
                    <PrimaryButton
                      onClick={() => requestRevision(mode === 'reject')}
                      disabled={busy || !feedback.trim()}
                      className={mode === 'reject' ? '!bg-red-600 hover:!bg-red-700' : '!bg-amber-600 hover:!bg-amber-700'}
                    >
                      {busy ? 'Submitting…' : mode === 'reject' ? 'Send feedback' : 'Request revision'}
                    </PrimaryButton>
                  </div>
                  {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={approve}
                      disabled={busy}
                      className="p-4 rounded-xl bg-green-50 hover:bg-green-100 border border-green-200 text-center transition-colors disabled:opacity-50"
                    >
                      <Check size={22} className="mx-auto text-green-700 mb-1.5" />
                      <div className="text-sm font-semibold text-green-900">{busy ? 'Approving…' : 'Approve'}</div>
                      <div className="text-[10px] text-green-700 mt-0.5">One-click, locks the design</div>
                    </button>
                    <button
                      onClick={() => setMode('revise')}
                      disabled={busy}
                      className="p-4 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-center transition-colors disabled:opacity-50"
                    >
                      <MessageSquare size={22} className="mx-auto text-amber-700 mb-1.5" />
                      <div className="text-sm font-semibold text-amber-900">Request revision</div>
                      <div className="text-[10px] text-amber-700 mt-0.5">Needs tweaks</div>
                    </button>
                    <button
                      onClick={() => setMode('reject')}
                      disabled={busy}
                      className="p-4 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-center transition-colors disabled:opacity-50"
                    >
                      <RotateCcw size={22} className="mx-auto text-red-700 mb-1.5" />
                      <div className="text-sm font-semibold text-red-900">Not right</div>
                      <div className="text-[10px] text-red-700 mt-0.5">Start over</div>
                    </button>
                  </div>
                  {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mt-3">{error}</div>}
                </>
              )}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 space-y-6">
          {/* BRIEF (read-only) */}
          {!isAwaitingBrief && design.brief_notes && (
            <div>
              <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">Brief</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 border border-gray-100">{design.brief_notes}</div>
            </div>
          )}

          {/* LOGOS & ASSETS (combined: team + customer) */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Logos &amp; assets</div>

            {teamAssets.length > 0 && (
              <div>
                <div className="text-[11px] text-gray-500 mb-2 flex items-center gap-1.5">
                  <Badge tone="purple">From team</Badge>
                  <span>Logos &amp; reference materials uploaded for this design</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {teamAssets.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => a.signed_url && setLightbox(a.signed_url)}
                      className="border border-gray-200 rounded-lg overflow-hidden hover:border-blue-300 transition-colors bg-white text-left"
                    >
                      <div className="aspect-square bg-gray-50 flex items-center justify-center">
                        {a.signed_url ? (
                          <img src={a.signed_url} alt="" className="w-full h-full object-contain" onError={(e) => { e.target.style.display = 'none' }} />
                        ) : (
                          <FileText size={16} className="text-gray-300" />
                        )}
                      </div>
                      <div className="px-1.5 py-1 flex items-center justify-between gap-1">
                        <span className="text-[10px] text-gray-700 truncate">{a.file_type}</span>
                        <span className="text-[9px] text-gray-400">v{a.version}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              {teamAssets.length > 0 && (
                <div className="text-[11px] text-gray-500 mb-2">
                  <Badge tone="blue">You</Badge>
                  <span className="ml-1.5">Assets you've attached from your brand library</span>
                </div>
              )}
              <DesignAttachments design={design} company={company} contact={contact} readOnly={isApproved} />
            </div>
          </div>

          {/* MOCKUP VERSIONS — older */}
          {olderMockups.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Older versions <span className="font-normal text-gray-400">· {olderMockups.length}</span>
              </div>
              <div className="space-y-2">
                {olderMockups.map((f) => {
                  const isVApproved = (f.notes || '').trim().toLowerCase() === 'approved'
                  return (
                    <button
                      key={f.id}
                      onClick={() => f.signed_url && setLightbox(f.signed_url)}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left ${isVApproved ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'}`}
                    >
                      <div className="w-14 h-14 rounded-md bg-white border border-gray-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {f.signed_url ? (
                          <img src={f.signed_url} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none' }} />
                        ) : (
                          <ImageIcon size={16} className="text-gray-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">Version {f.version}</span>
                          {isVApproved && <Badge tone="green">Approved</Badge>}
                        </div>
                        <div className="text-xs text-gray-400">{formatDate(f.created_at)}</div>
                        {f.notes && !isVApproved && (
                          <div className="text-xs text-gray-700 whitespace-pre-wrap mt-1.5 bg-white/60 rounded px-2 py-1">{f.notes}</div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>

    {/* Lightbox */}
    {lightbox && (
      <div
        className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
        onClick={() => setLightbox(null)}
      >
        <img src={lightbox} alt="" className="max-w-full max-h-full object-contain" />
        <button
          onClick={() => setLightbox(null)}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
        >
          <X size={20} />
        </button>
      </div>
    )}
    </>
  )
}
