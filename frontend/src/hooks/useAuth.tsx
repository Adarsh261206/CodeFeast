import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { api } from '@/api/client'

export type User = {
  email: string
  role: 'admin' | 'user'
}

type AuthState = {
  user: User | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => void
}

const AuthCtx = createContext<AuthState>({ user: null, loading: true, refresh: async()=>{}, logout: ()=>{} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    const token = localStorage.getItem('cf_token')
    if (!token) { setUser(null); setLoading(false); return }
    try {
      const res = await api.get('/auth/me')
      const u = res.data.user as User
      // sync storage with server truth
      localStorage.setItem('cf_email', u.email)
      localStorage.setItem('cf_role', u.role)
      setUser(u)
    } catch {
      // token invalid/expired -> clear
      localStorage.removeItem('cf_token')
      localStorage.removeItem('cf_email')
      localStorage.removeItem('cf_role')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const logout = () => {
    localStorage.removeItem('cf_token')
    localStorage.removeItem('cf_email')
    localStorage.removeItem('cf_role')
    setUser(null)
    window.location.href = '/login'
  }

  return (
    <AuthCtx.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth(): AuthState {
  return useContext(AuthCtx)
}

// legacy helper for non-react contexts — still reads storage but prefer useAuth()
export function userMe(): User | null {
  const token = typeof window !== 'undefined' ? localStorage.getItem('cf_token') : null
  if (!token) return null
  const email = localStorage.getItem('cf_email') || 'anonymous@local'
  const role = (localStorage.getItem('cf_role') as User['role']) || 'user'
  return { email, role }
}





