import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Star, Check } from 'lucide-react'
import { PrimaryButton, SecondaryButton } from './ui'

/**
 * Customer-facing project review modal.
 * Captures NPS score (0–10) + optional written testimonial / feedback,
 * writes to projects.nps_score / .testimonial / .feedback_client and
 * flips projects.review_completed to true.
 *
 * Props:
 *   project        — { id, name, nps_score, testimonial, feedback_client, review_completed }
 *   onClose()
 *   onSaved(updatedProject)
 */
export default function ProjectReviewModal({ project, onClose, onSaved }) {
  const [score, setScore] = useState(project?.nps_score ?? null)
  const [testimonial, setTestimonial] = useState(project?.testimonial || '')
  const [feedback, setFeedback] = useState(project?.feedback_client || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(!!project?.review_completed && !!project?.nps_score)

  // Close on ESC
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async () => {
    if (score == null) { setError('Please pick a score from 0 to 10.'); return }
    setBusy(true); setError(null)
    const { data, error: err } = await supabase
      .from('projects')
      .update({
        nps_score: score,
        testimonial: testimonial?.trim() || null,
        feedback_client: feedback?.trim() || null,
        review_completed: true,
      })
      .eq('id', project.id)
      .select()
      .single()
    setBusy(false)
    if (err) { setError(err.message); return }
    setDone(true)
    onSaved?.(data)
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center" onClick={(e) => e.stopPropagation()}>
          <div className="w-14 h-14 mx-auto rounded-full bg-green-100 text-green-600 flex items-center justify-center mb-4">
            <Check size={28} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Thanks for your feedback!</h3>
          <p className="text-sm text-gray-600 mt-2">We really appreciate you taking the time. Your account manager will see it right away.</p>
          <div className="mt-6"><PrimaryButton onClick={onClose}>Close</PrimaryButton></div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Rate this project</h3>
            <p className="text-xs text-gray-500 mt-0.5">{project?.name || 'Your project'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-900">How likely are you to recommend Custom95 to a friend or colleague?</label>
            <p className="text-xs text-gray-500 mt-1">0 = not at all, 10 = extremely likely</p>
            <div className="mt-3 grid grid-cols-11 gap-1.5">
              {Array.from({ length: 11 }).map((_, i) => {
                const active = score === i
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setScore(i)}
                    className={`h-10 rounded-lg text-sm font-semibold border transition-all ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400'
                    }`}
                  >
                    {i}
                  </button>
                )
              })}
            </div>
            {score != null && (
              <div className="mt-2 text-xs text-gray-600 flex items-center gap-1">
                <Star size={12} className={score >= 9 ? 'text-green-500' : score >= 7 ? 'text-yellow-500' : 'text-red-500'} />
                You picked <strong className="mx-1">{score}</strong> — {score >= 9 ? 'promoter' : score >= 7 ? 'passive' : 'detractor'}.
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900">Want to share a public testimonial? <span className="font-normal text-gray-400">(optional)</span></label>
            <textarea
              value={testimonial}
              onChange={(e) => setTestimonial(e.target.value)}
              rows={3}
              placeholder="What did you love about working with us?"
              className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900">Anything we could have done better? <span className="font-normal text-gray-400">(stays internal)</span></label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              placeholder="Honest feedback helps us improve the next project."
              className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</div>}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <SecondaryButton onClick={onClose} disabled={busy}>Maybe later</SecondaryButton>
          <PrimaryButton onClick={save} disabled={busy || score == null}><Check size={14} />{busy ? 'Saving…' : 'Submit review'}</PrimaryButton>
        </div>
      </div>
    </div>
  )
}
