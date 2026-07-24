import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Plus } from 'lucide-react'
import { formatDate } from './ui'

// Small chooser: add the current product to an open proposal, or start a new one.
export default function ProposalPicker({ company, onClose, onSelect, onCreateNew }) {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase.from('proposals')
      .select('id, proposal_number, name, status, created_at')
      .eq('company_id', company.id)
      .in('status', ['inquiry_received', 'discovery'])
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (!cancelled) { setProposals(data ?? []); setLoading(false) } })
    return () => { cancelled = true }
  }, [company.id])

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Add to which proposal?</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <button
            onClick={onCreateNew}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-blue-200 bg-blue-50/40 hover:bg-blue-50 text-left"
          >
            <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center"><Plus size={16} /></div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900">Start a new proposal</div>
              <div className="text-xs text-gray-500">Open the wizard with this product pre-loaded.</div>
            </div>
          </button>

          {loading ? (
            <div className="text-sm text-gray-400 py-4 text-center">Loading…</div>
          ) : proposals.length > 0 ? (
            <>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Or add to an open proposal</div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {proposals.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onSelect(p)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 text-left"
                  >
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-12">#{p.proposal_number}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{p.name || `Proposal ${p.proposal_number}`}</div>
                      <div className="text-xs text-gray-500">{p.status?.replace(/_/g, ' ')} · {formatDate(p.created_at)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
