import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState('email') // 'email' | 'code'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Surface errors that come back from a clicked magic link (e.g. the link was
  // already consumed by an email security scanner, so the token is expired).
  // Without this the app would silently drop back to the login form and loop.
  useEffect(() => {
    const parse = (str) => new URLSearchParams(str.startsWith('#') ? str.slice(1) : str)
    const hash = parse(window.location.hash)
    const query = parse(window.location.search)
    const errCode = hash.get('error_code') || query.get('error_code')
    const errDesc = hash.get('error_description') || query.get('error_description')
    if (errCode || errDesc) {
      const desc = (errDesc || '').replace(/\+/g, ' ')
      if (errCode === 'otp_expired' || /expired|invalid/i.test(desc)) {
        setError(
          "That sign-in link had already been used or expired — this often happens when a company email filter opens the link first. Enter your email below and use the 6-digit code from the email instead of the link."
        )
      } else {
        setError(desc || 'Sign-in failed. Please try again.')
      }
      // Clean the error out of the URL so it doesn't stick around on retry.
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  const sendCode = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) setError(error.message)
    else setStep('code')
    setLoading(false)
  }

  const verifyCode = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const token = code.replace(/\s/g, '')
    // The audit trail shows these OTPs are issued as either magic-link ('email')
    // or recovery type depending on how the user was provisioned, so try the
    // common types until one validates.
    let lastError = null
    for (const type of ['email', 'recovery', 'magiclink']) {
      const { error } = await supabase.auth.verifyOtp({ email, token, type })
      if (!error) {
        lastError = null
        break // onAuthStateChange in App.jsx takes over from here
      }
      lastError = error
    }
    if (lastError) setError('That code is incorrect or has expired. Tap "Resend code", then enter the code from the newest email straight away — each new code cancels the previous one.')
    setLoading(false)
  }

  const reset = () => {
    setStep('email')
    setCode('')
    setError(null)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Custom95</h1>
          <p className="text-sm text-gray-500 mt-1">Customer Portal</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {step === 'code' ? (
            <form onSubmit={verifyCode} className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900 mb-1">Check your email</h2>
                <p className="text-sm text-gray-600">
                  We sent a sign-in code and link to <span className="font-medium">{email}</span>.
                  Enter the code from that email below — this is the most reliable way to sign in.
                  Use the code from the <span className="font-medium">most recent</span> email; older codes stop working.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sign-in code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter code"
                  autoFocus
                  required
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {loading ? 'Verifying…' : 'Sign in'}
              </button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" onClick={sendCode} disabled={loading} className="text-blue-600 hover:text-blue-700">
                  Resend code
                </button>
                <button type="button" onClick={reset} className="text-gray-500 hover:text-gray-700">
                  Use a different email
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={sendCode} className="space-y-4">
              <p className="text-sm text-gray-600 mb-2">
                Sign in to manage your account, approve designs, and track your projects.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Work email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="you@company.com"
                  required
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {loading ? 'Sending code…' : 'Send sign-in code'}
              </button>
              <p className="text-xs text-gray-400 text-center mt-3">
                Don't have access? Ask your Custom95 account manager to invite you.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
