import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  Calendar as CalendarIcon, Image as ImageIcon, Plus, X, ChevronLeft, ChevronRight,
  Trash2, Repeat, LayoutGrid, List as ListIcon,
} from 'lucide-react'
import { PageHeader, Spinner, PrimaryButton, SecondaryButton, Badge, formatDate } from '../components/ui'
import BrandAssetsSection from '../components/BrandAssetsSection'

const EVENT_TYPES = [
  { value: 'campaign', label: 'Campaign', tone: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50' },
  { value: 'product_launch', label: 'Product launch', tone: 'bg-purple-500', text: 'text-purple-700', bg: 'bg-purple-50' },
  { value: 'trade_show', label: 'Trade show', tone: 'bg-pink-500', text: 'text-pink-700', bg: 'bg-pink-50' },
  { value: 'seasonal', label: 'Seasonal', tone: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  { value: 'holiday', label: 'Holiday', tone: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' },
  { value: 'meeting', label: 'Meeting', tone: 'bg-gray-500', text: 'text-gray-700', bg: 'bg-gray-100' },
  { value: 'deadline', label: 'Deadline', tone: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50' },
  { value: 'other', label: 'Other', tone: 'bg-slate-500', text: 'text-slate-700', bg: 'bg-slate-50' },
]
const TYPE_BY_VALUE = Object.fromEntries(EVENT_TYPES.map((t) => [t.value, t]))

// --- Date helpers (no library, timezone-safe) ---
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const WEEKDAY_LETTERS = ['M','T','W','T','F','S','S']
// Format a Date using LOCAL components — avoids UTC offset shifts.
function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
// Parse a 'YYYY-MM-DD' string into a Date at LOCAL midnight (not UTC).
function parseDateStr(s) {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function daysInMonth(year, month0) { return new Date(year, month0 + 1, 0).getDate() }
function firstWeekdayMonStart(year, month0) {
  // 0=Sun..6=Sat → 0=Mon..6=Sun
  const d = new Date(year, month0, 1).getDay()
  return (d + 6) % 7
}

// Expand a list of events into per-date map for a given year (handles yearly recurrence + multi-day spans)
function buildEventsByDate(events, year) {
  const map = {}
  const yearStart = new Date(year, 0, 1)
  const yearEnd = new Date(year, 11, 31)
  for (const e of events) {
    if (!e.event_date) continue
    const start = parseDateStr(e.event_date)
    const end = e.end_date ? parseDateStr(e.end_date) : new Date(start)
    const spans = []
    // base occurrence
    spans.push({ start: new Date(start), end: new Date(end) })
    // yearly recurrence: shift to current year if it's not already there
    if (e.recurrence === 'yearly' && start.getFullYear() !== year) {
      const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      const shiftedStart = new Date(year, start.getMonth(), start.getDate())
      const shiftedEnd = new Date(year, start.getMonth(), start.getDate() + diffDays)
      spans.push({ start: shiftedStart, end: shiftedEnd })
    }
    for (const s of spans) {
      if (s.end < yearStart || s.start > yearEnd) continue
      const cur = new Date(Math.max(s.start.getTime(), yearStart.getTime()))
      const stop = new Date(Math.min(s.end.getTime(), yearEnd.getTime()))
      while (cur <= stop) {
        const k = ymd(cur)
        ;(map[k] = map[k] || []).push(e)
        cur.setDate(cur.getDate() + 1)
      }
    }
  }
  return map
}

function MiniMonth({ year, month0, eventsByDate, onPickDate, today }) {
  const firstDay = firstWeekdayMonStart(year, month0)
  const totalDays = daysInMonth(year, month0)
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div className="text-sm font-semibold text-gray-900 mb-2">{MONTH_NAMES[month0]}</div>
      <div className="grid grid-cols-7 gap-0 text-center text-[10px] text-gray-400 mb-1">
        {WEEKDAY_LETTERS.map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, idx) => {
          if (d == null) return <div key={idx} />
          const key = ymd(new Date(year, month0, d))
          const dayEvents = eventsByDate[key] || []
          const isToday = today.getFullYear() === year && today.getMonth() === month0 && today.getDate() === d
          return (
            <button
              key={idx}
              onClick={() => onPickDate(new Date(year, month0, d), dayEvents)}
              className={`relative aspect-square flex flex-col items-center justify-start pt-1 text-[11px] rounded-md transition-colors ${
                dayEvents.length > 0
                  ? 'bg-blue-50 hover:bg-blue-100 text-gray-900 font-medium'
                  : 'hover:bg-gray-50 text-gray-700'
              } ${isToday ? 'ring-1 ring-blue-500' : ''}`}
            >
              <span>{d}</span>
              {dayEvents.length > 0 && (
                <div className="absolute bottom-0.5 flex gap-0.5">
                  {Array.from(new Set(dayEvents.map((e) => e.event_type))).slice(0, 3).map((t, i) => (
                    <span key={i} className={`w-1 h-1 rounded-full ${TYPE_BY_VALUE[t]?.tone || 'bg-gray-400'}`} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function EventModal({ company, contact, initial, defaultDate, onClose, onSaved, onDeleted }) {
  const isEdit = !!initial?.id
  const [form, setForm] = useState({
    title: initial?.title || '',
    description: initial?.description || '',
    event_date: initial?.event_date || (defaultDate ? ymd(defaultDate) : ymd(new Date())),
    end_date: initial?.end_date || '',
    event_type: initial?.event_type || 'campaign',
    recurrence: initial?.recurrence || 'none',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDel, setConfirmDel] = useState(false)

  const save = async () => {
    if (!form.title.trim() || !form.event_date) { setError('Title and date are required.'); return }
    setBusy(true); setError(null)
    const payload = {
      company_id: company.id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      event_date: form.event_date,
      end_date: form.end_date || null,
      event_type: form.event_type,
      recurrence: form.recurrence,
      created_by: null,
    }
    const result = isEdit
      ? await supabase.from('calendar_events').update(payload).eq('id', initial.id).select().single()
      : await supabase.from('calendar_events').insert(payload).select().single()
    setBusy(false)
    if (result.error) { setError(result.error.message); return }
    onSaved(result.data)
  }

  const del = async () => {
    setBusy(true)
    const { error: err } = await supabase.from('calendar_events').delete().eq('id', initial.id)
    setBusy(false)
    if (err) { setError(err.message); return }
    onDeleted?.()
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">{isEdit ? 'Edit event' : 'New event'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Event title"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={form.event_type}
            onChange={(e) => setForm({ ...form, event_type: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start date *</label>
              <input
                type="date"
                value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End date <span className="text-gray-400">(optional)</span></label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.recurrence === 'yearly'}
              onChange={(e) => setForm({ ...form, recurrence: e.target.checked ? 'yearly' : 'none' })}
              className="accent-blue-600"
            />
            <Repeat size={12} />Repeat every year
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            placeholder="Notes (optional)"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</div>}
        </div>
        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between gap-2">
          {isEdit ? (
            confirmDel ? (
              <div className="flex items-center gap-2">
                <button onClick={() => setConfirmDel(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                <button onClick={del} disabled={busy} className="text-xs font-medium text-red-600 hover:text-red-700 inline-flex items-center gap-1">
                  <Trash2 size={11} />{busy ? '…' : 'Confirm delete'}
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDel(true)} className="text-xs text-gray-500 hover:text-red-600 inline-flex items-center gap-1">
                <Trash2 size={12} />Delete
              </button>
            )
          ) : <span />}
          <div className="flex gap-2">
            <SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
            <PrimaryButton onClick={save} disabled={busy}>{busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create event'}</PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  )
}

function DayDrawer({ date, events, onClose, onAdd, onEdit }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-sm bg-white h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="text-xs text-gray-500">{date.toLocaleDateString(undefined, { weekday: 'long' })}</div>
            <h3 className="text-base font-semibold text-gray-900">{date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {events.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-6">No events on this date.</div>
          ) : (
            events.map((e) => {
              const meta = TYPE_BY_VALUE[e.event_type] || TYPE_BY_VALUE.other
              return (
                <button
                  key={e.id + ymd(date)}
                  onClick={() => onEdit(e)}
                  className={`w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 ${meta.bg}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{e.title}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {formatDate(e.event_date)}{e.end_date && e.end_date !== e.event_date ? ` → ${formatDate(e.end_date)}` : ''}
                        {e.recurrence === 'yearly' && <span className="ml-2 inline-flex items-center gap-0.5"><Repeat size={9} />yearly</span>}
                      </div>
                      {e.description && <div className="text-xs text-gray-600 mt-1 line-clamp-2">{e.description}</div>}
                    </div>
                    <Badge tone="gray">{meta.label}</Badge>
                  </div>
                </button>
              )
            })
          )}
          <PrimaryButton onClick={() => onAdd(date)} className="w-full justify-center mt-2">
            <Plus size={14} />Add event on this date
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}

function ListView({ year, eventsByDate, today, onEdit, onAddOnDate }) {
  // Flatten the per-date map into an array of { date, event } entries.
  // Use plain string comparisons (no Date math) so timezone offsets don't shift dates.
  const entries = []
  for (const [dateStr, dayEvents] of Object.entries(eventsByDate)) {
    for (const e of dayEvents) {
      if (!e.event_date) continue
      const parts = e.event_date.split('-')
      if (parts.length !== 3) continue
      const monthDay = `${parts[1]}-${parts[2]}`
      const startDateStr = e.recurrence === 'yearly' ? `${year}-${monthDay}` : e.event_date
      if (startDateStr === dateStr) {
        // Build a local-midnight Date for sorting/display; the string is already YYYY-MM-DD.
        const [y, m, d] = dateStr.split('-').map(Number)
        entries.push({ date: new Date(y, m - 1, d), event: e })
      }
    }
  }
  entries.sort((a, b) => a.date - b.date)

  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const upcoming = entries.filter((x) => x.date >= todayStart)
  const past = entries.filter((x) => x.date < todayStart)

  // Group by month
  const groupByMonth = (rows) => {
    const groups = {}
    for (const r of rows) {
      const key = `${r.date.getFullYear()}-${r.date.getMonth()}`
      if (!groups[key]) {
        groups[key] = { label: `${MONTH_NAMES[r.date.getMonth()]} ${r.date.getFullYear()}`, rows: [] }
      }
      groups[key].rows.push(r)
    }
    return Object.entries(groups).map(([k, v]) => ({ key: k, ...v }))
  }

  const renderGroup = (g) => (
    <div key={g.key}>
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">{g.label}</div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {g.rows.map(({ date, event }) => {
          const meta = TYPE_BY_VALUE[event.event_type] || TYPE_BY_VALUE.other
          const isMultiDay = event.end_date && event.end_date !== event.event_date
          return (
            <button
              key={`${event.id}-${ymd(date)}`}
              onClick={() => onEdit(event)}
              className="w-full flex items-center gap-4 px-4 py-3 text-left border-b border-gray-50 last:border-0 hover:bg-blue-50/30"
            >
              <div className="w-14 flex-shrink-0 text-center">
                <div className="text-[10px] uppercase tracking-wide text-gray-400">{date.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                <div className="text-lg font-semibold text-gray-900 leading-none mt-0.5">{date.getDate()}</div>
              </div>
              <div className={`w-1 self-stretch rounded-full ${meta.tone}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-medium text-gray-900 truncate">{event.title}</div>
                  <Badge tone="gray">{meta.label}</Badge>
                  {event.recurrence === 'yearly' && <Badge tone="blue"><Repeat size={9} className="mr-0.5" />yearly</Badge>}
                  {isMultiDay && <span className="text-[10px] text-gray-500">→ {formatDate(event.end_date)}</span>}
                </div>
                {event.description && <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{event.description}</div>}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onAddOnDate(date) }}
                className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 flex-shrink-0"
                title="Add another event on this date"
              >
                <Plus size={12} />
              </button>
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      {upcoming.length === 0 && past.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200">
          <CalendarIcon size={28} className="mx-auto text-gray-300 mb-2" />
          <div className="text-sm text-gray-500">No events for {year}.</div>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-4">
              <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Upcoming · {upcoming.length}</div>
              {groupByMonth(upcoming).map(renderGroup)}
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Past in {year} · {past.length}</div>
              {groupByMonth(past).map(renderGroup)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CalendarTab({ company, contact }) {
  const today = useMemo(() => new Date(), [])
  const [year, setYear] = useState(today.getFullYear())
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [pickedDate, setPickedDate] = useState(null)
  const [eventModal, setEventModal] = useState(null) // { initial?, defaultDate? }
  const [typeFilter, setTypeFilter] = useState('all')
  const [view, setView] = useState('year') // 'year' | 'list'

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('company_id', company.id)
      if (cancelled) return
      setEvents(data ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company?.id, refresh])

  const filteredEvents = typeFilter === 'all' ? events : events.filter((e) => e.event_type === typeFilter)
  const eventsByDate = useMemo(() => buildEventsByDate(filteredEvents, year), [filteredEvents, year])
  const countsByType = useMemo(() => {
    const m = Object.fromEntries(EVENT_TYPES.map((t) => [t.value, 0]))
    for (const e of events) if (m[e.event_type] != null) m[e.event_type]++
    return m
  }, [events])

  if (loading) return <Spinner />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setYear((y) => y - 1)} className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center justify-center"><ChevronLeft size={14} /></button>
          <div className="text-lg font-semibold text-gray-900 w-20 text-center">{year}</div>
          <button onClick={() => setYear((y) => y + 1)} className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center justify-center"><ChevronRight size={14} /></button>
          {year !== today.getFullYear() && (
            <button onClick={() => setYear(today.getFullYear())} className="ml-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg">Today</button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setView('year')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md inline-flex items-center gap-1.5 ${view === 'year' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}
            >
              <LayoutGrid size={13} />Year
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md inline-flex items-center gap-1.5 ${view === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}
            >
              <ListIcon size={13} />List
            </button>
          </div>
          <PrimaryButton onClick={() => setEventModal({ defaultDate: new Date() })}>
            <Plus size={14} />Add event
          </PrimaryButton>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setTypeFilter('all')}
          className={`px-2.5 py-1 text-xs font-medium rounded-full ring-1 ring-inset ${typeFilter === 'all' ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'}`}
        >
          All ({events.length})
        </button>
        {EVENT_TYPES.map((t) => {
          const active = typeFilter === t.value
          const n = countsByType[t.value]
          if (n === 0) return null
          return (
            <button
              key={t.value}
              onClick={() => setTypeFilter(active ? 'all' : t.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded-full ring-1 ring-inset inline-flex items-center gap-1.5 ${
                active ? `${t.bg} ${t.text} ring-current` : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${t.tone}`} />
              {t.label} ({n})
            </button>
          )
        })}
      </div>

      {view === 'year' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {MONTH_NAMES.map((_, m) => (
            <MiniMonth
              key={m}
              year={year}
              month0={m}
              eventsByDate={eventsByDate}
              today={today}
              onPickDate={(d, dayEvents) => setPickedDate({ date: d, events: dayEvents })}
            />
          ))}
        </div>
      ) : (
        <ListView
          year={year}
          eventsByDate={eventsByDate}
          today={today}
          onEdit={(e) => setEventModal({ initial: e })}
          onAddOnDate={(d) => setEventModal({ defaultDate: d })}
        />
      )}

      {pickedDate && (
        <DayDrawer
          date={pickedDate.date}
          events={pickedDate.events}
          onClose={() => setPickedDate(null)}
          onAdd={(d) => { setPickedDate(null); setEventModal({ defaultDate: d }) }}
          onEdit={(e) => { setPickedDate(null); setEventModal({ initial: e }) }}
        />
      )}
      {eventModal && (
        <EventModal
          company={company}
          contact={contact}
          initial={eventModal.initial}
          defaultDate={eventModal.defaultDate}
          onClose={() => setEventModal(null)}
          onSaved={() => { setEventModal(null); setRefresh((r) => r + 1) }}
          onDeleted={() => { setEventModal(null); setRefresh((r) => r + 1) }}
        />
      )}
    </div>
  )
}

function BrandingTab({ company, contact }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <ImageIcon size={16} className="text-gray-400" />Brand assets
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">Your logos, fonts, guidelines, and photos. Reuse them when submitting design briefs.</p>
      </div>
      <BrandAssetsSection company={company} contact={contact} />
    </div>
  )
}

export default function BrandPage({ company, contact }) {
  const [tab, setTab] = useState('calendar')
  return (
    <div className="space-y-6">
      <PageHeader title="Brand" subtitle="Plan your year and manage your brand assets." />
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
          { id: 'branding', label: 'Branding', icon: ImageIcon },
        ].map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-2 transition-colors ${
                tab === t.id ? 'text-blue-600 border-blue-600' : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              <Icon size={14} />{t.label}
            </button>
          )
        })}
      </div>
      {tab === 'calendar' && <CalendarTab company={company} contact={contact} />}
      {tab === 'branding' && <BrandingTab company={company} contact={contact} />}
    </div>
  )
}
