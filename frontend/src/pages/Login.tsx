import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import BackgroundCanvas from '@/components/BackgroundCanvas'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isRegister, setIsRegister] = useState(false)
  const navigate = useNavigate()

  // Load Google Identity Services script and render button
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
    if (!clientId) return
    const existing = document.getElementById('google-identity-script') as HTMLScriptElement | null
    if (existing) {
      // already loaded — try to render button immediately
      if ((window as any).google?.accounts?.id) {
        const c = document.getElementById('google-btn-container')
        if (c && c.childElementCount===0) {
          ;(window as any).google.accounts.id.renderButton(c, { type: 'standard', theme: 'filled_black', text: 'signin_with', size: 'large', shape: 'pill', width: 320, logo_alignment: 'left' })
        }
      }
      return
    }
    const script = document.createElement('script')
    script.id = 'google-identity-script'
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => {
      // @ts-ignore
      if (window.google?.accounts?.id) {
        // @ts-ignore
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: any) => handleGoogleCredential(response.credential)
        })
        const container = document.getElementById('google-btn-container')
        if (container) {
          // @ts-ignore
          window.google.accounts.id.renderButton(container, {
            type: 'standard',
            theme: 'filled_black',
            text: 'signin_with',
            size: 'large',
            shape: 'pill',
            width: 320,
            logo_alignment: 'left'
          })
        }
      }
    }
    script.onerror = () => setError('Failed to load Google Sign-In')
    document.body.appendChild(script)
    return () => { /* keep script for next mount */ }
  }, [])

  const handleGoogleCredential = async (idToken: string) => {
    try {
      setError('')
      setLoading(true)
      const res = await api.post('/auth/google', { idToken })
      localStorage.setItem('cf_token', res.data.token)
      localStorage.setItem('cf_email', res.data.user.email)
      localStorage.setItem('cf_role', res.data.user.role)
      navigate('/')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Google sign-in failed')
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-[440px]">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 grid place-items-center text-white font-bold text-sm">CF</div>
            <div className="text-[22px] font-semibold tracking-tight text-slate-900">CodeFeast</div>
          </div>
          <div className="mt-2 text-sm text-slate-500">Assess. Code. Succeed. — Odoo inspired</div>
        </div>

        <form
        className="bg-white border border-slate-200 rounded-xl shadow-sm px-6 py-7 w-full space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setError('')
          setLoading(true)
          
          try {
            const endpoint = isRegister ? '/auth/register' : '/auth/login'
            const res = await api.post(endpoint, { email, password })
            localStorage.setItem('cf_token', res.data.token)
            localStorage.setItem('cf_email', res.data.user.email)
            localStorage.setItem('cf_role', res.data.user.role)
            navigate('/')
          } catch (e: any) {
            setError(e.response?.data?.error || (isRegister ? 'Registration failed' : 'Login failed'))
          } finally {
            setLoading(false)
          }
        }}
      >
        <h1 className="text-2xl font-bold tracking-tight">{isRegister ? 'Create account' : 'Login'}</h1>
        <label className="block text-sm font-medium text-slate-700">Email</label>
        <input
          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus-ring placeholder:text-slate-400"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          autoComplete="email"
        />
        <label className="block text-sm font-medium text-slate-700">Password {isRegister && <span className="text-xs font-normal text-slate-500">(min 8 chars)</span>}</label>
        <input
          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus-ring placeholder:text-slate-400"
          type="password"
          required
          minLength={isRegister ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
        />
        {error && (
          <div className="text-rose-400 text-sm text-center">{error}</div>
        )}
        <button 
          disabled={loading}
          className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition focus-ring"
        >
          {loading ? (isRegister ? 'Creating...' : 'Logging in...') : (isRegister ? 'Create account' : 'Continue')}
        </button>
        <div className="text-xs text-center text-slate-500">
          {isRegister ? (
            <span>
              Already have an account?{' '}
              <button type="button" className="text-slate-900 font-medium hover:underline" onClick={() => setIsRegister(false)}>Login</button>
            </span>
          ) : (
            <span>
              New here?{' '}
              <button type="button" className="text-slate-900 font-medium hover:underline" onClick={() => setIsRegister(true)}>Create an account</button>
            </span>
          )}
        </div>
        <div className="relative py-3">
          <div className="absolute inset-x-0 top-1/2 h-px bg-slate-200" />
          <div className="relative w-fit mx-auto px-3 text-xs text-slate-500 bg-white">or</div>
        </div>
        <div id="google-btn-container" className="grid place-items-center" />
        </form>
      </div>
    </div>
  )
}


