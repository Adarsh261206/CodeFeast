import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '@/hooks/useAuth'
import ConfirmModal from '@/components/ConfirmModal'

type Report = {
  _id: string
  candidateEmail: string
  assessmentId?: string
  totalTimeTakenSec: number
  averageScore: number
  passRate: number
  totalProblems: number
  passedProblems: number
  languages: string[]
  allResults: { testcase: string; passed: boolean; expected?: string; output?: string; error?: string }[]
  createdAt: string
  lastUpdated: string
  security?: { tabSwitches?: number; fullscreenExits?: number }
  endedBy?: { reason?: string; at?: string }
}

type ReportStats = {
  totalSubmissions: number
  averageScore: number
  passRate: number
  topLanguages: { language: string; count: number }[]
}

export default function Reports() {
  const [reports, setReports] = useState<Report[]>([])
  const [stats, setStats] = useState<ReportStats>({
    totalSubmissions: 0,
    averageScore: 0,
    passRate: 0,
    topLanguages: []
  })
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState('all')
  const [sortBy, setSortBy] = useState('date')
  const { user } = useAuth()
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id?: string; bulk?: boolean }>({ open: false })
  const [error, setError] = useState<string | null>(null)
  const [assessmentTitles, setAssessmentTitles] = useState<Record<string,string>>({})
  const [totalReports, setTotalReports] = useState(0)

  useEffect(() => {
    loadReports()
    loadMeta()
  }, [])

  const loadMeta = async () => {
    try {
      const [aRes, pRes] = await Promise.allSettled([api.get('/assessments?limit=100'), api.get('/problems?limit=100')])
      if (aRes.status==='fulfilled') {
        const map: Record<string,string> = {}
        for (const a of (aRes.value.data.assessments||[])) map[a._id]=a.title
        setAssessmentTitles(map)
      }
    } catch {}
  }

  const loadReports = async () => {
    try {
      const res = await api.get('/reports?limit=50')
      
      const reportsData = res.data.reports || []
      if (typeof res.data.total === 'number') setTotalReports(res.data.total)
      
      // Clean and validate the data with explicit property mapping
      const cleanReports = reportsData.map((report: any) => {
        const cleanReport = {
          _id: report._id || '',
          candidateEmail: report.candidateEmail || '',
          assessmentId: report.assessmentId || null,
          totalTimeTakenSec: Number(report.totalTimeTakenSec) || 0,
          averageScore: Number(report.averageScore) || 0,
          passRate: Number(report.passRate) || 0,
          totalProblems: Number(report.totalProblems) || 0,
          passedProblems: Number(report.passedProblems) || 0,
          languages: Array.isArray(report.languages) ? report.languages : [],
          allResults: Array.isArray(report.allResults) ? report.allResults : [],
          createdAt: report.createdAt || new Date().toISOString(),
          lastUpdated: report.lastUpdated || new Date().toISOString(),
          security: report.security || { tabSwitches: 0, fullscreenExits: 0 },
          endedBy: report.endedBy || null
        }
        
        return cleanReport
      })
      
      setReports(cleanReports)
      calculateStats(cleanReports)
    } catch (e) {
      setError('Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    setLoading(true)
    loadReports()
  }

  const handleDelete = async (id?: string) => {
    try {
      if (id) {
        await api.delete(`/reports/${id}`)
      } else {
        await api.delete('/reports')
      }
      await loadReports()
    } catch (e) {
      console.error('Failed to delete report(s):', e)
    } finally {
      setConfirmDelete({ open: false })
    }
  }

  const formatDate = (dateString: string | Date) => {
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) {
        return 'Invalid Date'
      }
      return date.toLocaleString()
    } catch (e) {
      return 'Invalid Date'
    }
  }

  const calculateStats = (reportsData: Report[]) => {
    const total = reportsData.length
    const avgScore = total > 0 ? reportsData.reduce((sum, r) => sum + (r.averageScore || 0), 0) / total : 0
    const passCount = reportsData.filter(r => (r.passRate || 0) >= 0.5).length
    const passRate = total > 0 ? (passCount / total) * 100 : 0

    // Language stats
    const languageCounts: Record<string, number> = {}
    reportsData.forEach(r => {
      if (r.languages && Array.isArray(r.languages)) {
        r.languages.forEach(lang => {
          if (lang && lang !== 'n/a') {
            languageCounts[lang] = (languageCounts[lang] || 0) + 1
          }
        })
      }
    })
    const topLanguages = Object.entries(languageCounts)
      .map(([language, count]) => ({ language, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    setStats({
      totalSubmissions: total,
      averageScore: avgScore,
      passRate,
      topLanguages
    })
  }

  const filteredReports = reports.filter(report => {
    const matchesSearch = report.candidateEmail.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesLanguage = selectedLanguage === 'all' || (report.languages && report.languages.includes(selectedLanguage))
    return matchesSearch && matchesLanguage
  })

  const sortedReports = [...filteredReports].sort((a, b) => {
    switch (sortBy) {
      case 'score':
        return b.averageScore - a.averageScore
      case 'time':
        return a.totalTimeTakenSec - b.totalTimeTakenSec
      case 'date':
      default:
        return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
    }
  })

  const sanitizeCsv = (v: string) => {
    const s = String(v)
    // Prevent CSV injection: prefix =, +, -, @
    if (/^[=+\-@]/.test(s)) return `'${s}`
    // Escape quotes and wrap if contains comma/quote/newline
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const exportReports = () => {
    const csvContent = [
      ['Email', 'Assessment ID', 'Average Score', 'Pass Rate', 'Problems Passed', 'Total Problems', 'Languages', 'Total Time (s)', 'Total Test Cases Passed', 'Created At'],
      ...sortedReports.map(r => [
        r.candidateEmail,
        r.assessmentId || 'N/A',
        (r.averageScore * 100).toFixed(1) + '%',
        (r.passRate * 100).toFixed(1) + '%',
        (r.passedProblems || 0).toString(),
        (r.totalProblems || 0).toString(),
        r.languages && r.languages.length > 0 ? r.languages.join(', ') : 'N/A',
        (r.totalTimeTakenSec || 0).toString(),
        r.allResults ? r.allResults.filter(tc => tc.passed).length.toString() : '0',
        formatDate(r.createdAt)
      ])
    ].map(row => row.map(sanitizeCsv).join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `codefeast-reports-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Reports</h1>
        <div className="space-y-3">
          {[1,2,3,4,5].map((i) => (
            <div key={i} className="glass-card neon-border p-4 animate-pulse">
              <div className="h-4 bg-surface rounded mb-2"></div>
              <div className="h-3 bg-surface rounded w-2/3"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500 mt-1">Server-verified pure local execution • Odoo-style analytics</p>
      </div>
      
      {/* Error Display */}
      {error && (
        <div className="glass-card neon-border p-4 mb-6 bg-red-500/10 border-red-500/20">
          <div className="text-red-400 font-medium">Error: {error}</div>
        </div>
      )}
      
      {/* Admin Actions */}
      {user?.role === 'admin' && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={handleRefresh}
            className="bg-blue-500/80 hover:bg-blue-500 text-white px-4 py-2 rounded-md"
          >
            🔄 Refresh
          </button>
          <button
            onClick={exportReports}
            className="bg-warmAccent/80 hover:bg-warmAccent text-black px-4 py-2 rounded-md"
          >
            Export CSV
          </button>
          <button
            onClick={() => setConfirmDelete({ open: true, bulk: true })}
            className="bg-rose-500/80 hover:bg-rose-500 text-white px-4 py-2 rounded-md"
            title="Delete all reports"
          >
            Delete All
          </button>
        </div>
      )}
      
      {/* Scoring Information */}
      <div className="glass-card neon-border p-4 mb-6 bg-blue-500/5 border-blue-500/20">
        <div className="flex items-start gap-3">
          <div className="text-blue-400 text-lg">ℹ️</div>
          <div className="text-sm">
            <div className="font-medium text-blue-300 mb-1">Scoring Information — Pure Local Execution</div>
            <div className="text-textSecondary">
              Scores are <b>server-verified</b> via pure local runner (<code>JS vm / python3 / javac / g++ / dotnet</code>), never trusting client results. <code>averageScore = totalScore / totalProblems</code>, <code>passRate = passedProblems / totalProblems</code>. A 0% means:
              <ul className="list-disc list-inside mt-1 ml-2 space-y-1">
                <li>No test cases passed (including hidden)</li>
                <li>Compilation / runtime error</li>
                <li>Time limit exceeded (3s) or empty output</li>
              </ul>
              <div className="mt-2 text-amber-300">
                💡 <strong>Tip:</strong> Run with visible cases + custom input, then Submit — hidden tests are always re-executed server-side (no bypass).
              </div>
              <div className="mt-1 text-xs opacity-70">Time is MAX elapsed per assessment (not sum) to avoid double-count. Showing {reports.length}{totalReports? ` of ${totalReports}`:''} grouped reports.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm text-center">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Submissions</p>
          <p className="text-2xl font-semibold text-slate-900 mt-2">{stats.totalSubmissions}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm text-center">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Average Score</p>
          <p className="text-2xl font-semibold text-slate-900 mt-2">{(stats.averageScore * 100).toFixed(1)}%</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm text-center">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Pass Rate</p>
          <p className="text-2xl font-semibold text-emerald-600 mt-2">{stats.passRate.toFixed(1)}%</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm text-center">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Top Language</p>
          <p className="text-2xl font-semibold text-violet-600 mt-2">
            {stats.topLanguages[0]?.language || 'N/A'}
          </p>
        </div>
      </div>

      {/* Language Distribution */}
      {stats.topLanguages.length > 0 && (
        <div className="glass-card neon-border p-4">
          <h3 className="font-semibold mb-3">Language Distribution</h3>
          <div className="flex gap-4">
            {stats.topLanguages.map((lang, idx) => (
              <div key={lang.language} className="text-center">
                <div className="text-lg font-semibold text-accentSecondary">{lang.language}</div>
                <div className="text-sm text-textSecondary">{lang.count} submissions</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-surface border border-borderToken rounded-md p-2 focus-ring"
          />
        </div>
        <select
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value)}
          className="bg-surface border border-borderToken rounded-md p-2 focus-ring"
        >
          <option value="all">All Languages</option>
          {Array.from(new Set(reports.flatMap(r => r.languages || []))).map(lang => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-surface border border-borderToken rounded-md p-2 focus-ring"
        >
          <option value="date">Sort by Date</option>
          <option value="score">Sort by Score</option>
          <option value="time">Sort by Time</option>
        </select>
      </div>

      {/* Reports List */}
      {sortedReports.length === 0 ? (
        <div className="glass-card neon-border p-8 text-center">
          <p className="text-textSecondary">
            {searchTerm ? 'No reports match your search.' : 'No reports available yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedReports.map((report) => (
            <div key={report._id} className="glass-card neon-border p-4 hover:scale-[1.02] transition-transform">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-4">
                  <div className="font-semibold text-accentPrimary">{report.candidateEmail}</div>
                  <div className="text-sm text-textSecondary">
                    {formatDate(report.lastUpdated)}
                    {report.assessmentId && (
                      <span className="ml-2 text-blue-400" title={report.assessmentId}>
                        ({assessmentTitles[report.assessmentId] || 'Assessment'}: {report.assessmentId.slice(-6)})
                      </span>
                    )}
                    {!report.assessmentId && <span className="ml-2 text-amber-300">(Sample / no assessment)</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    report.averageScore >= 0.8 ? 'bg-green-500/20 text-green-400' :
                    report.averageScore >= 0.5 ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-rose-500/20 text-rose-400'
                  }`}>
                    Score: {((report.averageScore || 0) * 100).toFixed(1)}%
                  </span>
                  <span className="text-textSecondary">Time: {Math.round(report.totalTimeTakenSec || 0)}s</span>
                  <span className="text-textSecondary">Problems: {report.passedProblems || 0}/{report.totalProblems || 0}</span>
                  <span className="text-textSecondary">Languages: {report.languages && report.languages.length > 0 ? report.languages.join(', ') : 'N/A'}</span>
                  {report.security && (
                    <>
                      <span className="text-textSecondary">Tabs: {report.security.tabSwitches ?? 0}</span>
                      <span className="text-textSecondary">Fullscreen exits: {report.security.fullscreenExits ?? 0}</span>
                    </>
                  )}
                  {report.endedBy && (
                    <span
                      className="px-2 py-1 rounded-full text-xs font-medium bg-rose-500/20 text-rose-300"
                      title={report.endedBy.at ? formatDate(report.endedBy.at) : ''}
                    >
                      Ended: {report.endedBy.reason || 'Security violation'}
                    </span>
                  )}
                  {user?.role === 'admin' && (
                    <button
                      onClick={() => setConfirmDelete({ open: true, id: report._id })}
                      className="ml-2 text-rose-400 hover:text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded text-xs"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Assessment Summary */}
              <div className="mb-3 text-sm">
                <div className="flex items-center gap-4 text-textSecondary">
                  <span>Problems: {report.passedProblems || 0}/{report.totalProblems || 0} passed</span>
                  <span>Pass Rate: {((report.passRate || 0) * 100).toFixed(1)}%</span>
                  <span>Total Test Cases: {report.allResults ? report.allResults.length : 0}</span>
                  {report.allResults && report.allResults.some(r => r.error) && (
                    <span className="text-amber-400">⚠️ Some test cases had errors</span>
                  )}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {report.allResults && report.allResults.map((testcase, i) => (
                  <div
                    key={i}
                    className={`px-2 py-1 rounded-md text-xs border ${
                      testcase.passed 
                        ? 'border-emerald-500 text-emerald-300 bg-emerald-500/10' 
                        : 'border-rose-500 text-rose-300 bg-rose-500/10'
                    }`}
                    title={`${testcase.testcase} - Expected: ${testcase.expected || 'N/A'}, Output: ${testcase.output || 'N/A'}${testcase.error ? `, Error: ${testcase.error}` : ''}`}
                  >
                    <div className="truncate">{testcase.testcase}</div>
                    <div className="text-center font-medium">
                      {testcase.passed ? '✓ Pass' : '✗ Fail'}
                    </div>
                    {testcase.error && (
                      <div className="text-xs text-amber-300 mt-1 truncate" title={testcase.error}>
                        ⚠️ {testcase.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmModal
        open={confirmDelete.open}
        title={confirmDelete.bulk ? 'Delete All Reports' : 'Delete Report'}
        message={confirmDelete.bulk ? 'This will permanently delete all reports. This action cannot be undone.' : 'This will permanently delete the selected report. Continue?'}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => handleDelete(confirmDelete.id)}
        onCancel={() => setConfirmDelete({ open: false })}
      />
    </div>
  )
}



