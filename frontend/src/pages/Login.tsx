import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { api } from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import BackgroundCanvas from '@/components/BackgroundCanvas'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [rollNumber, setRollNumber] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isRegister, setIsRegister] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()
  const { refresh } = useAuth() as any

  return (
    <div className="min-h-screen flex items-center justify-center p-6 md:p-10 relative">
      {/* Background photo (Om Mishra) + dark gradient so the white card stays readable */}
      <div className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: 'url(/login-bg.jpg)' }} aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-900/55 to-slate-950/80" aria-hidden="true" />
      <div className="relative z-10 w-full max-w-[440px]">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white text-slate-900 grid place-items-center font-bold text-sm">CF</div>
            <div className="text-[22px] font-semibold tracking-tight text-white">CodeFeast</div>
          </div>
          <div className="mt-2 text-sm text-slate-300">Assess. Code. Succeed.</div>
        </div>

        <form
        className="bg-white border border-slate-200 rounded-xl shadow-sm px-6 py-7 w-full space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setError('')
          setLoading(true)
          
          try {
            const endpoint = isRegister ? '/auth/register' : '/auth/login'
            const payload = isRegister ? { email, password, name: name.trim(), rollNumber: rollNumber.trim() } : { email, password }
            const res = await api.post(endpoint, payload)
            localStorage.setItem('cf_token', res.data.token)
            localStorage.setItem('cf_email', res.data.user.email)
            localStorage.setItem('cf_role', res.data.user.role)
            // Critical: refresh auth context before navigating to avoid redirect loop
            try { await refresh() } catch {}
            window.location.href = '/'
          } catch (e: any) {
            const msg = e.response?.data?.error || e.response?.data?.details || (isRegister ? 'Registration failed' : 'Login failed')
            // Handle rate limit specifically
            if (String(msg).toLowerCase().includes('too many')) {
              setError('Too many attempts — please wait a moment and try again')
            } else {
              setError(typeof msg === 'string' ? msg : (isRegister ? 'Registration failed' : 'Login failed'))
            }
          } finally {
            setLoading(false)
          }
        }}
      >
        <h1 className="text-2xl font-bold tracking-tight">{isRegister ? 'Create account' : 'Login'}</h1>
        {isRegister && (
          <>
            <label className="block text-sm font-medium text-slate-700">Name</label>
            <input
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus-ring placeholder:text-slate-400"
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name (as on ID card)"
              autoComplete="name"
            />
            <label className="block text-sm font-medium text-slate-700">Roll No</label>
            <input
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus-ring placeholder:text-slate-400"
              type="text"
              required
              maxLength={30}
              value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value)}
              placeholder="e.g. 21CS10042"
              autoComplete="off"
            />
          </>
        )}
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
        <div className="relative">
          <input
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus-ring placeholder:text-slate-400 pr-11"
            type={showPassword ? 'text' : 'password'}
            required
            minLength={isRegister ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
          />
          <button
            type="button"
            onClick={() => setShowPassword(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="w-4.5 h-4.5" size={18} /> : <Eye className="w-4.5 h-4.5" size={18} />}
          </button>
        </div>
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
        </form>
      </div>
    </div>
  )
}


