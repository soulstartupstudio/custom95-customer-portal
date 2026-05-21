import { useState } from 'react'
import { FileText, Play, Trash2, ChevronUp, ChevronDown } from 'lucide-react'

const STEP_LABELS = ['Basics', 'Products & Quote', 'Delivery', 'Team']

/**
 * Floating "Proposal in progress" widget.
 * Mirrors the team-app widget — a collapsed gradient pill that expands to
 * show a summary of the draft, with Resume + Discard actions.
 *
 * Props:
 *   draft   — { step, form, items, ... } read from localStorage
 *   company — { name }
 *   onResume() — caller opens the wizard with `resumeDraft={draft}`
 *   onDiscard() — caller clears the localStorage draft
 */
export default function ProposalDraftWidget({ draft, company, onResume, onDiscard }) {
  const [expanded, setExpanded] = useState(false)
  if (!draft) return null

  const name = draft.form?.name?.trim() || 'Untitled proposal'
  const companyName = company?.name || 'Your company'
  const items = draft.items || []
  const lineCount = items.length
  const totalQty = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)
  const totalSteps = 4
  const stepIdx = Math.min(draft.step ?? 0, totalSteps - 1)
  const stepLabel = STEP_LABELS[stepIdx] || `Step ${stepIdx + 1}`

  const discard = () => {
    if (confirm('Discard this in-progress proposal? This cannot be undone.')) onDiscard?.()
  }

  return (
    <div className="fixed bottom-20 sm:bottom-20 right-3 sm:right-6 left-3 sm:left-auto z-[60] sm:w-[320px] max-w-[360px] mx-auto sm:mx-0 shadow-xl rounded-2xl overflow-hidden">
      {/* Gradient header — always visible, click to toggle */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3 flex items-center gap-3 text-left hover:from-blue-700 hover:to-indigo-700 transition-colors"
      >
        <div className="relative">
          <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center">
            <FileText size={16} />
          </div>
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-[10px] font-bold text-blue-700 flex items-center justify-center">1</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Proposal in progress</div>
          <div className="text-[11px] text-white/80 truncate">{companyName} · Step {stepIdx + 1}/{totalSteps}</div>
        </div>
        {expanded ? <ChevronDown size={16} className="text-white/80" /> : <ChevronUp size={16} className="text-white/80" />}
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="bg-white">
          <div className="p-3 bg-blue-50/40 m-3 rounded-lg text-xs">
            <Row label="Name" value={<span className="truncate">{name}</span>} />
            <Row label="Customer" value={<span className="truncate">{companyName}</span>} />
            <Row label="Step" value={<span>{stepIdx + 1}/{totalSteps} · {stepLabel}</span>} />
            <Row label="Line items" value={<span>{lineCount} · {totalQty} pcs</span>} />
          </div>
          <div className="px-3 pb-2">
            <button
              type="button"
              onClick={discard}
              className="w-full text-xs text-gray-500 hover:text-red-600 inline-flex items-center justify-center gap-1 py-1.5"
            >
              <Trash2 size={11} />Discard in-progress proposal
            </button>
          </div>
        </div>
      )}

      {/* Resume CTA — always visible */}
      <div className={`${expanded ? 'bg-white' : 'bg-gradient-to-r from-blue-600 to-indigo-600 pt-0'} px-3 pb-3`}>
        <button
          type="button"
          onClick={onResume}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-xl inline-flex items-center justify-center gap-2 shadow-sm"
        >
          <Play size={14} />Resume proposal
        </button>
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium text-right min-w-0">{value}</span>
    </div>
  )
}
