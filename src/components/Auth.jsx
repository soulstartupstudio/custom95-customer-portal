import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)

  const handleMagicLink = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) setError(error.message)
    else setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Custom95</h1>
          <p className="text-sm text-gray-500 mt-1">Customer Portal</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {sent ? (
            <div className="text-center">
              <h2 className="text-base font-semibold text-gray-900 mb-2">Check your email</h2>
              <p className="text-sm text-gray-600">
                We sent a sign-in link to <span className="font-medium">{email}</span>.
              </p>
              <button
                onClick={() => { setSent(false); setEmail('') }}
                className="mt-5 text-sm text-blue-600 hover:text-blue-700"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleMagicLink} className="space-y-4">
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
                {loading ? 'Sending link…' : 'Send sign-in link'}
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
