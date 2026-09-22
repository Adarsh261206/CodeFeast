import { Route, Routes, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Topbar from '@/components/Topbar'
import Sidebar from '@/components/Sidebar'
import Dashboard from '@/pages/Dashboard'
import LiveAssessment from '@/pages/LiveAssessment'
import Problems from '@/pages/Problems'
import Assessments from '@/pages/Assessments'
import Reports from '@/pages/Reports'
import Login from '@/pages/Login'
import { useEffect } from 'react'
import { useAuth } from './hooks/useAuth'

function Protected({ children, adminOnly=false }: { children: React.ReactNode, adminOnly?: boolean }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-6 text-textSecondary">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    const isAuthed = Boolean(user)
    if (!isAuthed && location.pathname !== '/login') {
      navigate('/login')
    }
    if (isAuthed && location.pathname === '/login') {
      navigate('/')
    }
  }, [location.pathname, navigate, user, loading])

  // Don't render login inside main layout
  if (location.pathname === '/login') {
    return <Login />
  }

  const isExam = location.pathname.startsWith('/live-assessment')

  // Exam mode: fullscreen workspace only, no sidebar/topbar — Odoo/Nike exam style
  if (isExam) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <Routes location={location}>
              <Route path="/live-assessment" element={<Protected><LiveAssessment /></Protected>} />
              <Route path="/live-assessment/:assessmentId" element={<Protected><LiveAssessment /></Protected>} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F1F5F9] text-slate-900">
      <Topbar />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 min-w-0 p-6 md:p-8 bg-[#F1F5F9]">
          <div className="max-w-[1280px] mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <Routes location={location}>
                  <Route path="/" element={<Protected><Dashboard /></Protected>} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/live-assessment" element={<Protected><LiveAssessment /></Protected>} />
                  <Route path="/live-assessment/:assessmentId" element={<Protected><LiveAssessment /></Protected>} />
                  <Route path="/problems" element={<Protected adminOnly><Problems /></Protected>} />
                  <Route path="/assessments" element={<Protected><Assessments /></Protected>} />
                  <Route path="/reports" element={<Protected adminOnly><Reports /></Protected>} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  )
}

export default App


