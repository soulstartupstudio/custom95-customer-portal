import { useEffect, useRef, useState } from 'react'
import { Bug, Wrench, Lightbulb, Paperclip, X, Loader2, CheckCircle2, MessageSquarePlus, FileText, ArrowLeft, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { PageHeader, EmptyState, Spinner, PrimaryButton, SecondaryButton, formatDate } from '../components/ui'

// Feedback & requests (Dex, 17 Nov 2026): customers tell us what's broken, what could be better or
// what they'd like to have. It lands in the team app (Development › Feedback & requests) as an
// FB ticket marked "Customer", next to the team's own feedback. Customers see their own tickets,
// the status, and the replies the team writes to them; internal notes stay internal (RLS).

const KINDS = [
  { id: 'bug', label: 'Something is not working', hint: 'An error, a wrong number, a page that won’t load', icon: Bug },
  { id: 'improvement', label: 'Could be better', hint: 'Something slow, unclear or missing a detail', icon: Wrench },
  { id: 'feature', label: 'Request', hint: 'Something new you’d like to be able to do', icon: Lightbulb },
]
const KIND_LABEL = { bug: 'Not working', improvement: 'Improvement', feature: 'Request' }
const STATUS = {
  new: { label: 'Received', tone: 'bg-gray-100 text-gray-700' },
  planned: { label: 'Planned', tone: 'bg-blue-50 text-blue-700' },
  in_progress: { label: 'In progress', tone: 'bg-amber-50 text-amber-800' },
  done: { label: 'Done', tone: 'bg-emerald-50 text-emerald-700' },
  wont_do: { label: 'Not planned', tone: 'bg-gray-100 text-gray-500' },
}
const PLACEHOLDER = {
  bug: 'What happened, and what did you expect? On which page?',
  improvement: 'What could work better, and how would that help you?',
  feature: 'What would you like to be able to do, and why?',
}
const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.zip'
const MAX_FILES = 6
const MAX_BYTES = 25 * 1024 * 1024
const extOf = (f) => ((f.name || '').includes('.') ? f.name.split('.').pop() : (f.type.split('/')[1] || 'bin')).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)

function StatusPill({ status }) {
  const s = STATUS[status] || STATUS.new
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.tone}`}>{s.label}</span>
}

function NewFeedback({ company, onClose, onCreated }) {
  const [kind, setKind] = useState('bug')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)
  const inputRef = useRef(null)

  const addFiles = (list) => {
    const all = Array.from(list || [])
    const ok = all.filter(f => f.size <= MAX_BYTES)
    if (ok.length < all.length) setError('Files over 25 MB were left out.')
    if (ok.length) setFiles(prev => [...prev, ...ok].slice(0, MAX_FILES))
  }
  const onPaste = (e) => {
    const imgs = Array.from(e.clipboardData?.items || []).filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean)
    if (imgs.length) { e.preventDefault(); addFiles(imgs) }
  }

  const submit = async () => {
    if (!title.trim()) { setError('Give it a short title.'); return }
    setBusy(true); setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const shots = []
      for (const [i, file] of files.entries()) {
        const path = `${user.id}/${Date.now()}-${i}.${extOf(file)}`
        const { error: upErr } = await supabase.storage.from('feedback').upload(path, file, { contentType: file.type || undefined })
        if (upErr) throw upErr
        shots.push({ path, name: file.name, type: file.type || null, size: file.size })
      }
      const { data, error: insErr } = await supabase.from('feedback_tickets').insert({
        source: 'portal', company_id: company.id, kind, title: title.trim(), description: description.trim() || null,
        page: 'Customer portal',
        context: { url: window.location.href, browser: navigator.userAgent, screen: `${window.innerWidth}×${window.innerHeight}` },
        screenshots: shots, created_by: user.id,
      }).select('id, number').single()
      if (insErr) throw insErr
      setDone(data); onCreated?.(data)
    } catch (e) {
      setError(e.message || String(e))
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-16 px-4" onPaste={onPaste}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}>
      <div className="fixed inset-0 bg-black/30" onClick={busy ? undefined : onClose} />
      <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg max-h-[88vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Feedback or a request</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close"><X size={18} /></button>
        </div>
        {done ? (
          <div className="p-6 text-center space-y-3">
            <CheckCircle2 size={36} className="mx-auto text-emerald-600" />
            <p className="text-sm text-gray-800">Thanks! We received it as <strong>FB-{done.number}</strong>. You’ll find the status and our reply under Feedback, and we’ll email you when there’s news.</p>
            <SecondaryButton onClick={onClose}>Close</SecondaryButton>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {KINDS.map(k => (
                <button key={k.id} type="button" onClick={() => setKind(k.id)}
                  className={`text-left rounded-lg border px-3 py-2 transition-colors ${kind === k.id ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <span className={`flex items-center gap-1.5 text-sm font-semibold ${kind === k.id ? 'text-blue-700' : 'text-gray-800'}`}><k.icon size={14} /> {k.label}</span>
                  <span className="block text-[11px] text-gray-500 mt-0.5 leading-snug">{k.hint}</span>
                </button>
              ))}
            </div>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Title</span>
              <input value={title} onChange={e => setTitle(e.target.value)} maxLength={140} autoFocus
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500" placeholder="In a few words" />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Details <span className="text-gray-400">(optional)</span></span>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500" placeholder={PLACEHOLDER[kind]} />
            </label>
            {kind === 'feature' && (
              <p className="text-xs text-gray-500">Want to order merch? Use <strong>Start proposal</strong> instead — that goes straight to your account manager.</p>
            )}
            <div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900">
                  <Paperclip size={14} /> Add screenshots or files
                </button>
                <span className="text-[11px] text-gray-400">or paste / drop them here</span>
                <input ref={inputRef} type="file" multiple accept={ACCEPT} className="sr-only" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
              </div>
              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-gray-700">
                      <FileText size={12} className="text-gray-400" /><span className="truncate flex-1">{f.name}</span>
                      <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600" aria-label="Remove file"><X size={12} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
              <PrimaryButton onClick={submit} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send</PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TicketView({ ticket, onBack }) {
  const [comments, setComments] = useState(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [me, setMe] = useState(null)
  const load = async () => {
    const { data } = await supabase.from('feedback_comments').select('id, user_id, body, created_at').eq('ticket_id', ticket.id).order('created_at')
    setComments(data || [])
  }
  useEffect(() => { load(); supabase.auth.getUser().then(({ data }) => setMe(data.user?.id || null)) }, [ticket.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const open = async (f) => {
    const { data } = await supabase.storage.from('feedback').createSignedUrl(f.path, 600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
  }
  const send = async () => {
    if (!body.trim()) return
    setBusy(true)
    const { error } = await supabase.from('feedback_comments').insert({ ticket_id: ticket.id, user_id: me, kind: 'comment', to_customer: true, body: body.trim() })
    setBusy(false)
    if (error) { alert(error.message); return }
    setBody(''); load()
  }
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"><ArrowLeft size={14} /> All feedback</button>
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-500">FB-{ticket.number} · {KIND_LABEL[ticket.kind]} · {formatDate(ticket.created_at)}</p>
            <h2 className="text-lg font-semibold text-gray-900 mt-0.5">{ticket.title}</h2>
          </div>
          <StatusPill status={ticket.status} />
        </div>
        {ticket.description && <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>}
        {(ticket.screenshots || []).length > 0 && (
          <div className="flex flex-wrap gap-3">{ticket.screenshots.map(f => (
            <button key={f.path} onClick={() => open(f)} className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"><FileText size={12} />{f.name || 'file'}</button>
          ))}</div>
        )}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-900">Conversation</p>
        {comments === null ? <Loader2 size={14} className="animate-spin text-gray-400" />
          : comments.length === 0 ? <p className="text-sm text-gray-500">No reply yet — we’ll email you when there is one.</p>
          : comments.map(c => (
            <div key={c.id} className={`rounded-lg px-3 py-2 text-sm ${c.user_id === me ? 'bg-gray-50' : 'bg-blue-50'}`}>
              <p className="text-[11px] text-gray-500 mb-0.5">{c.user_id === me ? 'You' : 'Custom95'} · {formatDate(c.created_at)}</p>
              <p className="text-gray-800 whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
        {!['done', 'wont_do'].includes(ticket.status) && (
          <div className="flex gap-2 pt-1">
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={2} placeholder="Add something…"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500" />
            <PrimaryButton onClick={send} disabled={busy || !body.trim()} className="self-end"><Send size={14} /></PrimaryButton>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FeedbackPage({ company, deepLinkId, clearDeepLink }) {
  const [tickets, setTickets] = useState(null)
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState(deepLinkId || null)
  const load = async () => {
    const { data } = await supabase.from('feedback_tickets').select('id, number, kind, title, description, status, screenshots, created_at, updated_at')
      .eq('source', 'portal').order('created_at', { ascending: false })
    setTickets(data || [])
  }
  useEffect(() => { load() }, [])
  useEffect(() => { if (deepLinkId) { setOpenId(deepLinkId); clearDeepLink?.() } }, [deepLinkId]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = (tickets || []).find(t => t.id === openId)
  if (open) return <TicketView ticket={open} onBack={() => setOpenId(null)} />

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Help us improve" title="Feedback & requests"
        subtitle="Something not working, could be better, or missing? Tell us — the team reads every message and replies here."
        action={<PrimaryButton onClick={() => setCreating(true)}><MessageSquarePlus size={16} /> New feedback</PrimaryButton>} />
      {tickets === null ? <Spinner /> : tickets.length === 0 ? (
        <EmptyState icon={MessageSquarePlus} title="Nothing sent yet" description="Your feedback and requests appear here, with their status and our replies."
          action={<PrimaryButton onClick={() => setCreating(true)}><MessageSquarePlus size={16} /> New feedback</PrimaryButton>} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {tickets.map(t => (
            <button key={t.id} onClick={() => setOpenId(t.id)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{t.title}</p>
                <p className="text-xs text-gray-500">FB-{t.number} · {KIND_LABEL[t.kind]} · {formatDate(t.created_at)}</p>
              </div>
              <StatusPill status={t.status} />
            </button>
          ))}
        </div>
      )}
      {creating && company?.id && <NewFeedback company={company} onClose={() => setCreating(false)} onCreated={() => load()} />}
    </div>
  )
}
