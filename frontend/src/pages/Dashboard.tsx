import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/api/client'
import AdminAIModal from '@/components/AdminAIModal'
import CreateAssessmentModal from '@/components/CreateAssessmentModal'

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalProblems: 0,
    totalAssessments: 0,
    totalReports: 0,
    recentSubmissions: 0
  })
  const [loading, setLoading] = useState(true)
  const [showAIModal, setShowAIModal] = useState(false)
  const [showAssessmentModal, setShowAssessmentModal] = useState(false)
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const problemsP = api.get('/problems')
      const assessmentsP = api.get('/assessments')
      const reportsP = user?.role === 'admin' ? api.get('/reports?limit=50') : Promise.resolve({ data: { reports: [] } } as any)
      const [problemsRes, assessmentsRes, reportsRes] = await Promise.allSettled([problemsP, assessmentsP, reportsP])

      const pCount = problemsRes.status==='fulfilled' ? (problemsRes.value.data.problems?.length || 0) : 0
      const aCount = assessmentsRes.status==='fulfilled' ? (assessmentsRes.value.data.assessments?.length || 0) : 0
      const reports = reportsRes.status==='fulfilled' ? (reportsRes.value.data.reports || []) : []
      setStats({
        totalProblems: pCount,
        totalAssessments: aCount,
        totalReports: reports.length,
        recentSubmissions: reports.filter((r: any) => {
          const today = new Date().toDateString()
          const reportDate = new Date(r.createdAt).toDateString()
          return today === reportDate
        }).length
      })
      if (problemsRes.status==='rejected' || assessmentsRes.status==='rejected') {
        console.warn('Some stats failed to load')
      }
    } catch (e) {
      // non-fatal
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateAIProblem = () => {
    setShowAIModal(true)
  }

  const handleCreateAssessment = () => {
    setShowAssessmentModal(true)
  }

  const handleViewReports = () => {
    navigate('/reports')
  }

  const handleNavigate = (path: string) => {
    navigate(path)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mt-4">
            {[1,2,3,4].map((i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-6 animate-pulse">
                <div className="h-4 bg-slate-100 rounded mb-3"></div>
                <div className="h-8 bg-slate-100 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="bg-white border border-slate-200 rounded-xl p-6 md:p-7 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">Welcome back, <span className="font-medium text-slate-900">{user?.email}</span> <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-slate-900 text-white border-slate-900">{user?.role}</span></p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> System operational</span>
            <span className="px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Problems</p>
              <p className="text-2xl font-semibold text-slate-900 mt-2">{stats.totalProblems}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-violet-50 border border-violet-100 grid place-items-center">
              <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Assessments</p>
              <p className="text-2xl font-semibold text-slate-900 mt-2">{stats.totalAssessments}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-sky-50 border border-sky-100 grid place-items-center">
              <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Reports</p>
              <p className="text-2xl font-semibold text-slate-900 mt-2">{stats.totalReports}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-100 grid place-items-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Today's Submissions</p>
              <p className="text-2xl font-semibold text-slate-900 mt-2">{stats.recentSubmissions}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 grid place-items-center">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            </div>
          </div>
        </div>
      </div>

      {user?.role === 'admin' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Quick Actions</h2>
            <span className="text-xs text-slate-400 hidden sm:inline">1 click</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
            <button onClick={handleGenerateAIProblem} className="group text-left p-4 rounded-xl border border-slate-200 hover:border-slate-900 hover:shadow-sm bg-white transition-all">
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-white grid place-items-center"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg></div>
              <div className="text-sm font-semibold text-slate-900 mt-3">Generate AI Problem</div>
              <div className="text-xs text-slate-500 mt-1">Create DSA with OpenAI</div>
            </button>
            <button onClick={handleCreateAssessment} className="group text-left p-4 rounded-xl border border-slate-200 hover:border-slate-900 hover:shadow-sm bg-slate-50 transition-all">
              <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 grid place-items-center"><svg className="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>
              <div className="text-sm font-semibold text-slate-900 mt-3">Create Assessment</div>
              <div className="text-xs text-slate-500 mt-1">Set duration & problems</div>
            </button>
            <button onClick={handleViewReports} className="group text-left p-4 rounded-xl bg-slate-900 hover:bg-black text-white border border-slate-900 transition-all">
              <div className="w-8 h-8 rounded-lg bg-white/10 grid place-items-center"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg></div>
              <div className="text-sm font-semibold mt-3">View Reports</div>
              <div className="text-xs text-slate-400 mt-1">Scores & analytics</div>
            </button>
            <button onClick={() => handleNavigate('/problems')} className="group text-left p-4 rounded-xl border border-slate-200 hover:border-slate-900 hover:shadow-sm bg-white transition-all">
              <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-100 grid place-items-center"><svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg></div>
              <div className="text-sm font-semibold text-slate-900 mt-3">Manage Problems</div>
              <div className="text-xs text-slate-500 mt-1">Edit bank</div>
            </button>
          </div>
        </div>
      )}

      {user?.role === 'user' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
            <button onClick={() => handleNavigate('/assessments')} className="text-left p-4 rounded-xl border border-slate-200 hover:border-slate-900 hover:shadow-sm bg-white transition-all">
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-white grid place-items-center"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg></div>
              <div className="text-sm font-semibold mt-3">View Assessments</div>
              <div className="text-xs text-slate-500 mt-1">Browse all</div>
            </button>
            <button onClick={() => handleNavigate('/assessments')} className="text-left p-4 rounded-xl bg-slate-900 text-white border border-slate-900 hover:bg-black transition-all">
              <div className="w-8 h-8 rounded-lg bg-white/10 grid place-items-center"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
              <div className="text-sm font-semibold mt-3">Start Assessment</div>
              <div className="text-xs text-slate-300 mt-1">Timed • secure</div>
            </button>
            <button onClick={() => handleNavigate('/assessments')} className="text-left p-4 rounded-xl border border-slate-200 hover:shadow-sm bg-emerald-50 border-emerald-100 transition-all">
              <div className="w-8 h-8 rounded-lg bg-white border border-emerald-100 grid place-items-center"><svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
              <div className="text-sm font-semibold text-slate-900 mt-3">My Submissions</div>
              <div className="text-xs text-slate-500 mt-1">History</div>
            </button>
          </div>
        </div>
      )}

      {showAIModal && (
        <AdminAIModal
          onClose={() => setShowAIModal(false)}
          onGenerated={() => {
            setShowAIModal(false)
            loadStats() // Refresh stats after generating problem
          }}
        />
      )}

      {showAssessmentModal && (
        <CreateAssessmentModal
          onClose={() => setShowAssessmentModal(false)}
          onCreated={() => {
            setShowAssessmentModal(false)
            loadStats() // Refresh stats after creating assessment
          }}
        />
      )}
    </div>
  )
}
