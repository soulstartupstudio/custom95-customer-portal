import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Image as ImageIcon, Check, MessageSquare, RotateCcw, FileText, Clock } from 'lucide-react'
import { StatusBadge, formatDate, PrimaryButton, SecondaryButton, Badge } from './ui'
import CommentsThread from './CommentsThread'
import DesignAttachments from './DesignAttachments'

export default function DesignDrawer({ design, company, contact, onClose, onUpdated }) {
  const [files, setFiles] = useState([])
  const [feedback, setFeedback] = useState('')
  const [mode, setMode] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [briefDraft, setBriefDraft] = useState(design.brief_notes || '')
  const [submittingBrief, setSubmittingBrief] = useState(false)
  const [displayImage, setDisplayImage] = useState(design.latest_file_url || null)

  useEffect(() => {
    supabase
      .from('design_files')
      .select('id, file_url, file_type, version, notes, created_at')
      .eq('design_task_id', design.id)
      .order('version', { ascending: false })
      .then(({ data }) => setFiles(data ?? []))

    if (!design.latest_file_url && design.proposal_requested_item_id) {
      supabase
        .from('proposal_requested_items')
        .select('reference_url, catalogue_item_id, catalogue_items(main_photo_url)')
        .eq('id', design.proposal_requested_item_id)
        .single()
        .then(({ data }) => {
          setDisplayImage(data?.reference_url || data?.catalogue_items?.main_photo_url || null)
        })
    }
  }, [design.id])

  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ')
  const isAwaitingBrief = design.status === 'awaiting_brief'
  const isInProgress = design.status === 'in_progress'
  const isSubmitted = design.status === 'submitted'
  const isRevisionRequested = design.status === 'revision_requested'
  const isApproved = design.status === 'approved'

  const logComment = async (body) => {
    await supabase.from('comments').insert({
      company_id: company.id,
      entity_type: 'design',
      entity_id: design.id,
      author_contact_id: contact.id,
      author_name: contactName,
      body,
    })
  }

  const countAttached = async () => {
    const { count } = await supabase
      .from('design_task_assets')
      .select('id', { count: 'exact', head: true })
      .eq('design_task_id', design.id)
    return count ?? 0
  }

  const submitBrief = async () => {
    setSubmittingBrief(true); setError(null)
    const { error: err } = await supabase
      .from('design_tasks')
      .update({ brief_notes: briefDraft.trim(), status: 'in_progress' })
      .eq('id', design.id)
    if (!err) {
      const n = await countAttached()
      await logComment(`📝 Submitted brief${n ? ` (+${n} attachment${n === 1 ? '' : 's'})` : ''}:\n\n${briefDraft.trim()}`)
    }
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
    if (!err) await logComment(`✅ Approved design${feedback.trim() ? `:\n\n${feedback.trim()}` : '.'}`)
    setBusy(false)
    if (err) { setError(err.message); return }
    onUpdated?.(); onClose()
  }

  const requestRevision = async (strong = false) => {
    if (!feedback.trim()) { setError('Please leave feedback so we know what to change.'); return }
    setBusy(true); setError(null)
    const prefix = strong ? '🔄 Requested a restart (direction not right)' : '✏️ Requested revision'
    const { error: err } = await supabase.from('design_tasks').update({
      status: 'revision_requested',
      client_feedback: feedback.trim(),
      revision_count: (design.revision_count ?? 0) + 1,
    }).eq('id', design.id)
    if (!err) {
      const n = await countAttached()
      await logComment(`${prefix}${n ? ` (${n} attachment${n === 1 ? '' : 's'} attached)` : ''}:\n\n${feedback.trim()}`)
    }
    setBusy(false)
    if (err) { setError(err.message); return }
    onUpdated?.(); onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="text-xs text-gray-500">Design</div>
            <h2 className="text-lg font-semibold text-gray-900">{design.title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={design.status} />
            {design.revision_count > 0 && <Badge>Revision {design.revision_count}</Badge>}
            {design.context === 'pre_sale' && <Badge tone="purple">Pre-sale</Badge>}
          </div>

          {displayImage && (
            <a href={displayImage} target="_blank" rel="noreferrer" className="block">
              <img
                src={displayImage}
                alt=""
                className="w-full rounded-lg border border-gray-200 bg-gray-50 max-h-96 object-contain"
                onError={(e) => { e.target.style.display = 'none' }}
              />
              {!design.latest_file_url && <div className="text-[10px] text-gray-400 text-center mt-1">Reference photo — mockup not yet uploaded</div>}
            </a>
          )}

          {isAwaitingBrief && (
            <div className="border border-amber-200 bg-amber-50/40 rounded-lg p-4 space-y-3">
              <div>
                <div className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  <FileText size={14} />Finish your brief
                </div>
                <p className="text-xs text-gray-600">We'll start designing as soon as you submit. Attach brand assets specific to this design below.</p>
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
            <div className="border border-blue-200 bg-blue-50/40 rounded-lg p-4 flex items-center gap-3">
              <Clock size={16} className="text-blue-600 flex-shrink-0" />
              <div className="text-sm text-blue-900">
                Our design team is working on this. You'll get a mockup here soon.
              </div>
            </div>
          )}

          {isRevisionRequested && (
            <div className="border border-amber-200 bg-amber-50/40 rounded-lg p-4 flex items-start gap-3">
              <RotateCcw size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-amber-900 mb-1">Revision requested</div>
                <div className="text-xs text-amber-800">We're iterating on your feedback. Next version coming soon.</div>
              </div>
            </div>
          )}

          {isApproved && (
            <div className="border border-green-200 bg-green-50 rounded-lg p-3 flex items-start gap-3">
              <Check size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-green-900">Design approved</div>
                <div className="text-xs text-green-700">
                  by {design.client_approved_by_name || 'you'} on {formatDate(design.client_approved_at)}
                </div>
              </div>
            </div>
          )}

          {isSubmitted && (
            <div className="border-t border-gray-100 pt-5">
              <div className="text-sm font-semibold text-gray-900 mb-3">Your decision</div>
              {mode === 'approve' ? (
                <div className="space-y-3">
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={3}
                    placeholder="Anything to say? (optional)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-2 justify-end">
                    <SecondaryButton onClick={() => { setMode(null); setFeedback('') }} disabled={busy}>Cancel</SecondaryButton>
                    <PrimaryButton onClick={approve} disabled={busy}>
                      <Check size={14} />{busy ? 'Approving…' : 'Confirm approval'}
                    </PrimaryButton>
                  </div>
                </div>
              ) : mode === 'revise' || mode === 'reject' ? (
                <div className="space-y-3">
                  <div className="text-xs text-gray-600">
                    {mode === 'revise' ? 'What should we adjust?' : 'What direction should we take instead?'}
                  </div>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={4}
                    placeholder={mode === 'revise' ? 'Tweak colours, logo size, typography…' : 'Describe the direction you want us to explore.'}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => setMode('approve')} className="p-3 rounded-lg bg-green-50 hover:bg-green-100 border border-green-200 text-center transition-colors">
                      <Check size={18} className="mx-auto text-green-700 mb-1" />
                      <div className="text-xs font-semibold text-green-900">Approve</div>
                      <div className="text-[10px] text-green-700">Looks great</div>
                    </button>
                    <button onClick={() => setMode('revise')} className="p-3 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-center transition-colors">
                      <MessageSquare size={18} className="mx-auto text-amber-700 mb-1" />
                      <div className="text-xs font-semibold text-amber-900">Request revision</div>
                      <div className="text-[10px] text-amber-700">Needs tweaks</div>
                    </button>
                    <button onClick={() => setMode('reject')} className="p-3 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-center transition-colors">
                      <RotateCcw size={18} className="mx-auto text-red-700 mb-1" />
                      <div className="text-xs font-semibold text-red-900">Not right</div>
                      <div className="text-[10px] text-red-700">Start over</div>
                    </button>
                  </div>
                  {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>}
                </div>
              )}
            </div>
          )}

          {!isAwaitingBrief && design.brief_notes && (
            <div>
              <div className="text-xs text-gray-500 mb-1 font-semibold">Brief</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{design.brief_notes}</div>
            </div>
          )}

          {isRevisionRequested && design.client_feedback && (
            <div>
              <div className="text-xs text-gray-500 mb-1 font-semibold">Your latest feedback</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap bg-amber-50 rounded-lg p-3">{design.client_feedback}</div>
            </div>
          )}

          {/* Per-design attachments (join table) */}
          <div className="pt-5 border-t border-gray-100">
            <DesignAttachments design={design} company={company} contact={contact} />
          </div>

          {files.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-2 font-semibold">Version history ({files.length})</div>
              <div className="space-y-2">
                {files.map((f) => (
                  <a key={f.id} href={f.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                    <ImageIcon size={16} className="text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900">Version {f.version}</div>
                      <div className="text-xs text-gray-400">{formatDate(f.created_at)}{f.notes ? ` · ${f.notes}` : ''}</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="pt-5 border-t border-gray-100">
            <CommentsThread entityType="design" entityId={design.id} company={company} contact={contact} />
          </div>
        </div>
      </div>
    </div>
  )
}
