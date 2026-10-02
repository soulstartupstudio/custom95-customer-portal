import { Check, ArrowRight } from 'lucide-react'

// Where a new Plan customer stands in onboarding — six steps they recognise (the team's
// internal checklist has more). Each open step says what to do next or who's on it.
const NEXT = {
  company: { text: 'Check your company details', tab: 'settings' },
  team: { text: 'Invite everyone with a say on merch — HR, events, office manager, interns, creatives, founders — to your Digital Merch Home', short: 'Invite your team', tab: 'contacts' },
  brand_assets: { text: 'Upload your logos & brand files', tab: 'brand' },
  questionnaire: { text: 'Tell us about your brand, team and moments', short: 'Fill in the Merch Questionnaire', tab: 'audit' },
  merch_audit: { text: 'We analyse your answers and walk you through the results' },
  merch_plan: { text: 'Your Merch Calendar, Core Collection and 90-day or year plan' },
}

export default function GettingStarted({ onboarding, navigate }) {
  if (!onboarding || onboarding.completed) return null
  const steps = onboarding.steps || []
  const done = steps.filter(s => s.done).length
  const nextOpen = steps.find(s => !s.done)
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Getting started</h3>
          <p className="text-xs text-gray-500 mt-0.5">{done} of {steps.length} completed</p>
        </div>
        {nextOpen && NEXT[nextOpen.key]?.tab && (
          <button onClick={() => navigate(NEXT[nextOpen.key].tab)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700">
            {NEXT[nextOpen.key].short || NEXT[nextOpen.key].text} <ArrowRight size={14} />
          </button>
        )}
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
        <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${(done / Math.max(1, steps.length)) * 100}%` }} />
      </div>
      <ol className="mt-4 space-y-2.5">
        {steps.map(s => {
          const hint = !s.done ? NEXT[s.key] : null
          return (
            <li key={s.key} className="flex items-start gap-3">
              <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${s.done ? 'bg-blue-600 text-white' : 'border-2 border-gray-300'}`}>
                {s.done && <Check size={12} strokeWidth={3} />}
              </span>
              <div className="min-w-0">
                {/* An open step the customer can act on is a link to where they do it. */}
                {hint?.tab
                  ? <button onClick={() => navigate(hint.tab)} className="text-sm text-gray-900 font-medium hover:text-blue-700 hover:underline text-left">{s.label}</button>
                  : <p className={`text-sm ${s.done ? 'text-gray-400 line-through' : 'text-gray-900 font-medium'}`}>{s.label}</p>}
                {hint && (hint.tab
                  ? <button onClick={() => navigate(hint.tab)} className="text-xs text-blue-600 hover:underline">{hint.text}</button>
                  : <p className="text-xs text-gray-500">{hint.text}</p>)}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
