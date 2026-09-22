import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'

// Back button removed per requirements

export default function Topbar() {
  const navigate = useNavigate()
  const { user, logout } = useAuth() as any

  useEffect(() => {
    document.documentElement.classList.remove('dark')
  }, [])

  const initial = user?.email?.[0]?.toUpperCase() || 'U'
  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-slate-200">
      <div className="flex items-center gap-4 px-4 h-14">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-slate-900 grid place-items-center text-white font-bold text-xs tracking-wide">CF</div>
          <div
            className="text-[15px] font-semibold tracking-tight text-slate-900 select-none cursor-pointer"
            onClick={() => navigate('/')}
            title="CodeFeast"
          >
            CodeFeast
          </div>
          <span className="hidden sm:inline-flex items-center text-[10px] font-semibold tracking-widest text-slate-600 bg-slate-900 text-white rounded-full px-2 py-0.5 ml-1">PRO</span>
        </div>
        <div className="hidden lg:flex flex-1 justify-center max-w-md mx-auto">
          <div className="w-full relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
            <input placeholder="Search problems, assessments…" className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300" aria-label="Search" />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {user && (
            <div className="hidden md:flex items-center gap-3">
              <div className="text-right leading-tight">
                <div className="text-sm font-medium text-slate-900 truncate max-w-[180px]">{user.email}</div>
                <div className="text-xs text-slate-500 capitalize">{user.role}</div>
              </div>
              <div className="w-8 h-8 rounded-full bg-slate-900 text-white grid place-items-center text-xs font-semibold">{initial}</div>
            </div>
          )}
          <div className="h-6 w-px bg-slate-200 hidden md:block" />
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-black text-white text-sm font-medium transition-colors focus-ring"
            onClick={() => logout()}
            aria-label="Logout"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7" /></svg>
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}


