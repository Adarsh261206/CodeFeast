import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '@/hooks/useAuth'

type Row = {
  rank: number
  candidateEmail: string
  name: string
  rollNumber: string
  score: number
  problemsAttempted: number
  problemsPassed: number
  tcPassed: number
  tcTotal: number
  timeSec: number
  languages: string[]
  lastActive: number
}

type Summary = {
  participants: number
  avgScore: number
  topScore: number
  tcPassed: number
}

type Assessment = { _id: string; title: string }

const emptySummary: Summary = { participants: 0, avgScore: 0, topScore: 0, tcPassed: 0 }

const formatTime = (sec: number) => {
  const s = Math.max(0, Math.round(sec || 0))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}m ${r}s`
}

const formatLastActive = (ms: number) => {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch { return '—' }
}

export default function Leaderboard() {
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState<Summary>(emptySummary)
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [assessmentId, setAssessmentId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { user } = useAuth()

  const load = async (aid: string) => {
    setLoading(true)
    setError('')
    try {
      const qs = aid ? `?assessmentId=${encodeURIComponent(aid)}` : ''
      const res = await api.get(`/leaderboard${qs}`)
      setRows(res.data.leaderboard || [])
      setSummary(res.data.summary || emptySummary)
    } catch {
      setError('Failed to load leaderboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(assessmentId) }, [assessmentId])

  useEffect(() => {
    api.get('/assessments?limit=100')
      .then(r => setAssessments(r.data.assessments || []))
      .catch(() => {})
  }, [])

  const rankStyle = (rank: number) =>
    rank === 1 ? 'bg-amber-50 text-amber-700 border-amber-200'
    : rank === 2 ? 'bg-slate-100 text-slate-600 border-slate-300'
    : rank === 3 ? 'bg-orange-50 text-orange-700 border-orange-200'
    : 'bg-slate-50 text-slate-600 border-slate-200'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Leaderboard</h1>
            <p className="text-sm text-slate-500 mt-1">Live standings — points are server-verified; latest attempt per problem counts.</p>
          </div>
          <select
            value={assessmentId}
            onChange={(e) => setAssessmentId(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 min-w-[200px]"
            aria-label="Filter by assessment"
          >
            <option value="">All assessments</option>
            {assessments.map(a => <option key={a._id} value={a._id}>{a.title}</option>)}
          </select>
        </div>
      </div>

      {/* Analysis strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs text-slate-500">Participants</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">{summary.participants}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs text-slate-500">Avg Score</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">{summary.avgScore.toFixed(2)}<span className="text-sm font-normal text-slate-400"> pts</span></div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs text-slate-500">Top Score</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">{summary.topScore.toFixed(2)}<span className="text-sm font-normal text-slate-400"> pts</span></div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs text-slate-500">Test Cases Passed</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">{summary.tcPassed}</div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <p className="text-rose-500 text-sm">{error}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 grid place-items-center mx-auto text-slate-400">🏆</div>
          <p className="text-slate-600 mt-3 text-sm">No submissions yet — standings will appear after the first submission.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium w-14">Rank</th>
                  <th className="px-4 py-3 font-medium">Participant</th>
                  <th className="px-4 py-3 font-medium text-right">Points</th>
                  <th className="px-4 py-3 font-medium text-right">Problems</th>
                  <th className="px-4 py-3 font-medium text-right">Test Cases</th>
                  <th className="px-4 py-3 font-medium text-right">Time</th>
                  <th className="px-4 py-3 font-medium">Languages</th>
                  <th className="px-4 py-3 font-medium">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const isMe = user?.email === r.candidateEmail
                  const avgPct = r.problemsAttempted > 0 ? Math.round((r.score / r.problemsAttempted) * 100) : 0
                  return (
                    <tr
                      key={r.candidateEmail}
                      className={`border-b border-slate-100 last:border-0 ${isMe ? 'bg-slate-50/80' : 'hover:bg-slate-50/50'}`}
                    >
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center justify-center min-w-8 h-7 px-2 rounded-full border text-xs font-semibold ${rankStyle(r.rank)}`}>
                          {r.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-slate-900 truncate">{r.name || r.candidateEmail}</span>
                          {r.rollNumber && (
                            <span className="inline-flex px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-medium shrink-0">{r.rollNumber}</span>
                          )}
                          {isMe && <span className="text-[11px] text-slate-400 shrink-0">(you)</span>}
                        </div>
                        {r.name && <div className="text-xs text-slate-400 truncate">{r.candidateEmail}</div>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-slate-900">{r.score.toFixed(2)}</span>
                        <span className="text-xs text-slate-400 ml-1">({avgPct}%)</span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">{r.problemsPassed}/{r.problemsAttempted}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{r.tcPassed}/{r.tcTotal}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatTime(r.timeSec)}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{r.languages.join(', ') || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{formatLastActive(r.lastActive)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/40 text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
            <span>Points = sum of per-problem scores (0–1 each).</span>
            <span>Tie-break: more test cases → less time.</span>
            <span>Rank changes live as submissions come in.</span>
          </div>
        </div>
      )}
    </div>
  )
}
