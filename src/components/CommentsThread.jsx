import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Send, MessageSquare } from 'lucide-react'
import { PrimaryButton, formatDate } from './ui'

export default function CommentsThread({ entityType, entityId, company, contact }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('comments')
      .select('id, body, author_name, author_contact_id, author_user_id, created_at')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!cancelled) {
          setComments(data ?? [])
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [entityType, entityId])

  const submit = async (e) => {
    e?.preventDefault()
    if (!body.trim() || !contact) return
    setSubmitting(true)
    setError(null)
    const authorName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email
    const { data, error: err } = await supabase.from('comments').insert({
      company_id: company.id,
      entity_type: entityType,
      entity_id: entityId,
      author_contact_id: contact.id,
      author_name: authorName,
      body: body.trim(),
    }).select().single()
    setSubmitting(false)
    if (err) { setError(err.message); return }
    setComments((c) => [...c, data])
    setBody('')
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
        <MessageSquare size={13} />
        <span>Comments{comments.length > 0 ? ` · ${comments.length}` : ''}</span>
      </div>
      <div className="space-y-3">
        {loading ? (
          <div className="text-xs text-gray-400">Loading…</div>
        ) : comments.length === 0 ? (
          <div className="text-xs text-gray-400">No comments yet.</div>
        ) : (
          comments.map((c) => {
            const isMe = c.author_contact_id === contact?.id
            const initial = c.author_name?.[0]?.toUpperCase() || '?'
            return (
              <div key={c.id} className="flex gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                  isMe ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                }`}>
                  {initial}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-gray-900">{c.author_name}</span>
                    <span className="text-xs text-gray-400">{formatDate(c.created_at)}</span>
                  </div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap mt-0.5">{c.body}</div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <form onSubmit={submit} className="mt-4 flex gap-2 items-start">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e)
          }}
          rows={2}
          placeholder="Leave a comment… (⌘+Enter to send)"
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <PrimaryButton type="submit" disabled={submitting || !body.trim()}>
          <Send size={14} />{submitting ? '…' : 'Send'}
        </PrimaryButton>
      </form>
      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2 mt-2">{error}</div>}
    </div>
  )
}
