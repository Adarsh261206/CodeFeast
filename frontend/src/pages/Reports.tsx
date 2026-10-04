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
  allResults: { testcase: string; passed: boolean; expected?: string; output?: string; error?: string; execMs?: number }[]
  submissions?: { problemId: string | null; language: string; code: string; score: number; problemTimeSec?: number; keystrokes?: number; pasteEvents?: number; activeTypingSec?: number; kpm?: number; attempts?: number; avgExecMs?: number; createdAt?: string }[]
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
  const [stats, setStats] = useState<ReportStats>({ totalSubmissions: 0, averageScore: 0, passRate: 0, topLanguages: [] })
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState('all')
  const [sortBy, setSortBy] = useState('date')
  const { user } = useAuth()
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id?: string; bulk?: boolean }>({ open: false })
  const [error, setError] = useState<string | null>(null)
  const [assessmentTitles, setAssessmentTitles] = useState<Record<string,string>>({})
  const [problemTitles, setProblemTitles] = useState<Record<string,string>>({})
  const [totalReports, setTotalReports] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => { loadReports(); loadMeta() }, [])

  const loadMeta = async () => {
    try {
      const [aRes, pRes] = await Promise.allSettled([api.get('/assessments?limit=100'), api.get('/problems?limit=100')])
      if (aRes.status==='fulfilled') {
        const map: Record<string,string> = {}
        for (const a of (aRes.value.data.assessments||[])) map[a._id]=a.title
        setAssessmentTitles(map)
      }
      if (pRes.status==='fulfilled') {
        const pmap: Record<string,string> = {}
        for (const p of (pRes.value.data.problems||[])) pmap[p._id]=p.title
        setProblemTitles(pmap)
      }
    } catch {}
  }

  const loadReports = async () => {
    try {
      const res = await api.get('/reports?limit=50')
      const reportsData = res.data.reports || []
      if (typeof res.data.total === 'number') setTotalReports(res.data.total)
      const cleanReports = reportsData.map((report: any) => ({
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
        submissions: Array.isArray(report.submissions) ? report.submissions : [],
        createdAt: report.createdAt || new Date().toISOString(),
        lastUpdated: report.lastUpdated || new Date().toISOString(),
        security: report.security || { tabSwitches: 0, fullscreenExits: 0 },
        endedBy: report.endedBy || null
      }))
      setReports(cleanReports)
      calculateStats(cleanReports)
    } catch (e) {
      setError('Failed to load reports')
    } finally { setLoading(false) }
  }

  const handleRefresh = () => { setLoading(true); loadReports() }
  const handleDelete = async (id?: string) => {
    try {
      if (id) await api.delete(`/reports/${id}`)
      else await api.delete('/reports')
      await loadReports()
    } catch (e) { console.error('Failed to delete report(s):', e) }
    finally { setConfirmDelete({ open: false }) }
  }

  const formatDate = (dateString: string | Date) => {
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return 'Invalid Date'
      return date.toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
    } catch { return 'Invalid Date' }
  }

  const calculateStats = (reportsData: Report[]) => {
    const total = reportsData.length
    const avgScore = total > 0 ? reportsData.reduce((sum, r) => sum + (r.averageScore || 0), 0) / total : 0
    const passCount = reportsData.filter(r => (r.passRate || 0) >= 0.5).length
    const passRate = total > 0 ? (passCount / total) * 100 : 0
    const languageCounts: Record<string, number> = {}
    reportsData.forEach(r => { r.languages?.forEach(lang => { if (lang && lang !== 'n/a') languageCounts[lang] = (languageCounts[lang] || 0) + 1 }) })
    const topLanguages = Object.entries(languageCounts).map(([language, count]) => ({ language, count })).sort((a, b) => b.count - a.count).slice(0, 5)
    setStats({ totalSubmissions: total, averageScore: avgScore, passRate, topLanguages })
  }

  const filteredReports = reports.filter(report => {
    const matchesSearch = report.candidateEmail.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesLanguage = selectedLanguage === 'all' || (report.languages && report.languages.includes(selectedLanguage))
    return matchesSearch && matchesLanguage
  })
  const sortedReports = [...filteredReports].sort((a, b) => {
    switch (sortBy) {
      case 'score': return b.averageScore - a.averageScore
      case 'time': return a.totalTimeTakenSec - b.totalTimeTakenSec
      case 'date': default: return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
    }
  })

  const sanitizeCsv = (v: string) => {
    const s = String(v)
    if (/^[=+\-@]/.test(s)) return `'${s}`
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const exportReports = () => {
    const csvContent = [
      ['Email', 'Assessment ID', 'Average Score', 'Pass Rate', 'Problems Passed', 'Total Problems', 'Languages', 'Total Time (s)', 'Total Test Cases Passed', 'Created At'],
      ...sortedReports.map(r => [
        r.candidateEmail, r.assessmentId || 'N/A', (r.averageScore * 100).toFixed(1) + '%', (r.passRate * 100).toFixed(1) + '%',
        (r.passedProblems || 0).toString(), (r.totalProblems || 0).toString(),
        r.languages && r.languages.length > 0 ? r.languages.join(', ') : 'N/A',
        (r.totalTimeTakenSec || 0).toString(),
        r.allResults ? r.allResults.filter(tc => tc.passed).length.toString() : '0',
        formatDate(r.createdAt)
      ])
    ].map(row => row.map(sanitizeCsv).join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `codefeast-reports-${new Date().toISOString().split('T')[0]}.csv`; a.click()
    window.URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm animate-pulse">
          <div className="h-6 bg-slate-100 rounded w-1/4 mb-2"></div>
          <div className="h-4 bg-slate-100 rounded w-1/2"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <div key={i} className="bg-white border border-slate-200 rounded-xl p-6 h-28 animate-pulse"><div className="h-4 bg-slate-100 rounded w-1/2 mb-3"></div><div className="h-8 bg-slate-100 rounded w-1/3"></div></div>)}
        </div>
      </div>
    )
  }

  const maxLangCount = Math.max(1, ...stats.topLanguages.map(l=>l.count))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Reports</h1>
            <p className="text-sm text-slate-500 mt-1">Server-verified • Pure local execution • {totalReports || reports.length} grouped • {reports.length} shown</p>
          </div>
          {user?.role === 'admin' && (
            <div className="flex items-center gap-2">
              <button onClick={handleRefresh} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium">Refresh</button>
              <button onClick={exportReports} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-sm font-medium">Export CSV</button>
              <button onClick={() => setConfirmDelete({ open: true, bulk: true })} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 rounded-lg text-sm font-medium">Delete All</button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-rose-100 grid place-items-center text-rose-600">!</div>
          <div className="text-sm font-medium text-rose-700">Error: {error}</div>
        </div>
      )}

      {/* Info */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 grid place-items-center text-blue-600 shrink-0">i</div>
          <div className="text-sm leading-relaxed">
            <div className="font-semibold text-slate-900">How scoring works — pure local</div>
            <div className="text-slate-600 mt-1">Scores are <b className="text-slate-900">server-verified</b> via <code className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs">localRunner</code> (JS vm / python3 / javac / g++ / dotnet), never trusting client. <span className="font-mono text-xs bg-slate-50 border px-1 rounded">avg = totalScore/totalProblems</span></div>
            <div className="text-xs text-slate-500 mt-2">Time is <b>MAX</b> elapsed (not sum). Hidden tests always re-executed server-side.</div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Groups</div>
          <div className="text-2xl font-semibold text-slate-900 mt-2">{stats.totalSubmissions}</div>
          <div className="text-xs text-slate-400 mt-1">{totalReports} total</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Avg Score</div>
          <div className="text-2xl font-semibold text-slate-900 mt-2">{(stats.averageScore * 100).toFixed(1)}%</div>
          <div className="h-1 bg-slate-100 rounded-full mt-3"><div className="h-1 bg-violet-600 rounded-full" style={{width: `${Math.min(100, stats.averageScore*100)}%`}} /></div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Pass Rate</div>
          <div className="text-2xl font-semibold text-emerald-600 mt-2">{stats.passRate.toFixed(1)}%</div>
          <div className="text-xs text-slate-500 mt-1">{stats.topLanguages.length} languages</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Top Language</div>
          <div className="text-2xl font-semibold text-slate-900 mt-2 truncate">{stats.topLanguages[0]?.language || 'N/A'}</div>
          <div className="text-xs text-slate-500 mt-1">{stats.topLanguages[0]?.count || 0} submissions</div>
        </div>
      </div>

      {/* Language Distribution */}
      {stats.topLanguages.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Language Distribution</h3>
          <div className="mt-4 space-y-3">
            {stats.topLanguages.map(lang => (
              <div key={lang.language} className="flex items-center gap-3">
                <div className="w-24 text-sm font-medium text-slate-700 capitalize">{lang.language}</div>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-2 bg-slate-900 rounded-full" style={{width: `${(lang.count/maxLangCount)*100}%`}} />
                </div>
                <div className="w-20 text-sm text-slate-500 text-right">{lang.count} • {((lang.count/stats.totalSubmissions)*100).toFixed(0)}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
            <input type="text" placeholder="Search by email…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 placeholder:text-slate-400" />
          </div>
          <select value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)} className="px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 min-w-[160px]">
            <option value="all">All Languages</option>
            {Array.from(new Set(reports.flatMap(r => r.languages || []))).map(lang => <option key={lang} value={lang}>{lang}</option>)}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 min-w-[140px]">
            <option value="date">Sort by Date</option>
            <option value="score">Sort by Score</option>
            <option value="time">Sort by Time</option>
          </select>
        </div>
      </div>

      {/* List */}
      {sortedReports.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 grid place-items-center mx-auto text-slate-400">∅</div>
          <p className="text-slate-600 mt-3 text-sm">{searchTerm ? 'No reports match your search.' : 'No reports yet — submit an assessment to see results.'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedReports.map((report) => {
            const scorePct = Math.round((report.averageScore||0)*100)
            const scoreColor = scorePct >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : scorePct >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200'
            const initial = report.candidateEmail[0]?.toUpperCase() || 'U'
            return (
              <div key={report._id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-slate-900 text-white grid place-items-center text-xs font-semibold shrink-0">{initial}</div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{report.candidateEmail}</div>
                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span>{formatDate(report.lastUpdated)}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                        {report.assessmentId ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 text-xs font-medium" title={report.assessmentId}>
                            {assessmentTitles[report.assessmentId] || 'Assessment'} • {report.assessmentId.slice(-6)}
                          </span>
                        ) : <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs">Sample</span>}
                        {report.endedBy && <span className="px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs">Ended: {report.endedBy.reason}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${scoreColor}`}>Score {scorePct}%</span>
                    <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-700 text-xs"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> {Math.round(report.totalTimeTakenSec)}s</span>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700 text-xs">{report.passedProblems}/{report.totalProblems} problems</span>
                    {user?.role === 'admin' && (
                      <button onClick={() => setConfirmDelete({ open: true, id: report._id })} className="ml-1 px-3 py-1.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 text-xs font-medium">Delete</button>
                    )}
                  </div>
                </div>

                {/* Meta */}
                <div className="px-6 py-3 bg-slate-50/50 border-b border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                  <span className="text-slate-600"><b className="text-slate-900">{report.languages.join(', ') || '—'}</b> <span className="text-slate-400">languages</span></span>
                  <span className="hidden sm:inline w-px h-3 bg-slate-200" />
                  <span className="text-slate-600">Tabs <b className="text-slate-900">{report.security?.tabSwitches ?? 0}</b></span>
                  <span className="text-slate-600">Fullscreen <b className="text-slate-900">{report.security?.fullscreenExits ?? 0}</b></span>
                  <span className="hidden sm:inline w-px h-3 bg-slate-200" />
                  <span className="text-slate-600">Avg KPM <b className="text-slate-900">{(() => { const subs = (report.submissions || []).filter((s: any) => (s.kpm || 0) > 0); return subs.length ? Math.round(subs.reduce((a: number, s: any) => a + (s.kpm || 0), 0) / subs.length) : 0 })()}</b></span>
                  <span className="text-slate-600">Pastes <b className="text-slate-900">{(report.submissions || []).reduce((a,s)=>a+(s.pasteEvents||0),0)}</b></span>
                  <span className="hidden sm:inline w-px h-3 bg-slate-200" />
                  <span className="text-slate-500">{report.allResults?.length || 0} test cases • {report.passRate ? (report.passRate*100).toFixed(0) : 0}% pass</span>
                  {report.allResults?.some(r=> r.error) && <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-xs">⚠ some errors</span>}
                </div>

                {/* Test cases */}
                {report.allResults && report.allResults.length > 0 && (
                  <div className="p-4">
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr className="text-left">
                            <th className="px-3 py-2 font-semibold text-slate-600 w-12">#</th>
                            <th className="px-3 py-2 font-semibold text-slate-600">Input</th>
                            <th className="px-3 py-2 font-semibold text-slate-600">Expected</th>
                            <th className="px-3 py-2 font-semibold text-slate-600">Output</th>
                            <th className="px-3 py-2 font-semibold text-slate-600 w-16">Exec</th>
                            <th className="px-3 py-2 font-semibold text-slate-600 w-20">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {report.allResults.map((tc, i) => (
                            <tr key={i} className={tc.passed ? 'bg-emerald-50/30' : 'bg-rose-50/30'}>
                              <td className="px-3 py-2 font-mono text-slate-700">{i+1}</td>
                              <td className="px-3 py-2 font-mono text-slate-700 max-w-[220px] truncate" title={tc.testcase}>{tc.testcase}</td>
                              <td className="px-3 py-2 font-mono text-slate-600 max-w-[160px] truncate" title={tc.expected}>{tc.expected || '—'}</td>
                              <td className="px-3 py-2 font-mono text-slate-900 max-w-[160px] truncate" title={tc.output}>{tc.output || '—'}</td>
                              <td className="px-3 py-2 font-mono text-slate-500">{tc.execMs ? `${tc.execMs}ms` : '—'}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${tc.passed ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                                  {tc.passed ? '✓ Pass' : '✗ Fail'}
                                </span>
                                {tc.error && <div className="text-[10px] text-amber-600 mt-1 truncate max-w-[140px]" title={tc.error}>⚠ {tc.error.slice(0,80)}</div>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Submitted Code — per problem */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900">Submitted Code</h4>
                    <button
                      onClick={() => setExpanded(prev => { const ns = new Set(prev); if (ns.has(report._id)) ns.delete(report._id); else ns.add(report._id); return ns })}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700"
                    >
                      {expanded.has(report._id) ? 'Hide' : `View Code (${report.submissions?.length || report.totalProblems})`}
                    </button>
                  </div>
                  {expanded.has(report._id) && (
                    <div className="mt-4 space-y-4">
                      {report.submissions && report.submissions.length > 0 ? (
                        report.submissions.map((sub: any, idx: number) => (
                          <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                              <div className="text-xs font-medium text-slate-700 flex items-center gap-2">
                                <span className="w-6 h-6 rounded bg-slate-900 text-white grid place-items-center text-xs">{idx+1}</span>
                                <span>{problemTitles[sub.problemId] || sub.problemId || `Problem ${idx+1}`}</span>
                                <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-xs">{sub.language}</span>
                                <span className={`px-2 py-0.5 rounded-full text-xs border ${sub.score >= 0.5 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>{Math.round((sub.score||0)*100)}%</span>
                              </div>
                              <button onClick={() => navigator.clipboard.writeText(sub.code || '')} className="text-xs px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg">Copy</button>
                            </div>
                            <div className="px-4 py-2 bg-slate-50/50 border-b border-slate-200 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
                              {sub.kpm > 0 && <span><b className="text-slate-900">{sub.kpm}</b> KPM</span>}
                              {sub.keystrokes > 0 && <span><b className="text-slate-900">{sub.keystrokes}</b> keys</span>}
                              {sub.attempts > 0 && <span><b className="text-slate-900">{sub.attempts}</b> runs</span>}
                              {sub.problemTimeSec > 0 && <span><b className="text-slate-900">{sub.problemTimeSec}s</b> time</span>}
                              {sub.avgExecMs > 0 && <span><b className="text-slate-900">{sub.avgExecMs}ms</b> avg exec</span>}
                              {sub.activeTypingSec > 0 && <span><b className="text-slate-900">{sub.activeTypingSec}s</b> typing</span>}
                              {sub.pasteEvents > 0 && <span className="text-amber-700"><b>{sub.pasteEvents}</b> pastes</span>}
                              {sub.pasteEvents === 0 && <span className="text-slate-400">0 pastes</span>}
                            </div>
                            <pre className="p-4 bg-slate-900 text-slate-100 font-mono text-xs overflow-auto max-h-72 whitespace-pre-wrap break-all">{sub.code || '// No code captured (old submission)'}</pre>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-200 rounded-lg">No code captured for this submission (created before code logging). New submissions will show code here.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <ConfirmModal open={confirmDelete.open} title={confirmDelete.bulk ? 'Delete All Reports' : 'Delete Report'} message={confirmDelete.bulk ? 'This will permanently delete all reports. This action cannot be undone.' : 'This will permanently delete the selected report. Continue?'} confirmText="Delete" cancelText="Cancel" onConfirm={() => handleDelete(confirmDelete.id)} onCancel={() => setConfirmDelete({ open: false })} />
    </div>
  )
}
