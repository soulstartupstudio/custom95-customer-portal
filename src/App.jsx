import { useState, useEffect, Component } from 'react'
import { supabase } from './lib/supabase'
import Auth from './components/Auth'
import Layout from './components/Layout'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace' }}>
          <h1 style={{ color: 'red' }}>Something went wrong</h1>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#fee', padding: 16, borderRadius: 8 }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const [session, setSession] = useState(null)
  const [contact, setContact] = useState(null)
  const [company, setCompany] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (!session) setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (!session) {
        setContact(null)
        setCompany(null)
        setAccessError(null)
        setLoading(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setAccessError(null)

      let { data: contacts, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('portal_auth_id', session.user.id)
        .eq('portal_active', true)
        .limit(1)

      if (cancelled) return
      if (error) {
        setAccessError(`Lookup failed: ${error.message}`)
        setLoading(false)
        return
      }

      let row = contacts?.[0]

      // First login: contact was invited by email but portal_auth_id not yet bound
      if (!row && session.user.email) {
        const claim = await supabase
          .from('contacts')
          .update({
            portal_auth_id: session.user.id,
            portal_active: true,
            portal_invite_accepted_at: new Date().toISOString(),
            last_login_at: new Date().toISOString(),
          })
          .ilike('email', session.user.email)
          .is('portal_auth_id', null)
          .select('*')
          .limit(1)
        if (!cancelled && claim.data?.[0]) row = claim.data[0]
      }

      if (!row) {
        setAccessError(`No portal access for ${session.user.email}. Ask your Custom95 account manager to invite you.`)
        setLoading(false)
        return
      }

      supabase
        .from('contacts')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', row.id)
        .then(() => {})

      const { data: co, error: coErr } = await supabase
        .from('companies')
        .select('id, name, status, brandshop_addon, whatsapp_group_url, plan_tier')
        .eq('id', row.company_id)
        .single()
      if (cancelled) return
      if (coErr) {
        setAccessError(`Could not load company: ${coErr.message}`)
        setLoading(false)
        return
      }
      setContact(row)
      setCompany(co)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [session])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!session) return <Auth />

  if (accessError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Access denied</h1>
          <p className="text-sm text-gray-600 mb-6">{accessError}</p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <Layout session={session} contact={contact} company={company} />
    </ErrorBoundary>
  )
}
