import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { getDb } from '../lib/db'
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth'

const router = Router()

// GET /api/leaderboard?assessmentId=<optional>&limit=<optional>  (ADMIN ONLY)
// Ranked standings per candidate: points = Σ (solve% × problem marks), latest attempt wins.
router.get('/', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const db = getDb()
    const assessmentId = (req.query.assessmentId as string | undefined)?.trim() || null
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '100', 10) || 100, 1), 500)
    const match: any = {}
    if (assessmentId) match.assessmentId = assessmentId

    const docs = await db.collection('reports').find(match).sort({ createdAt: 1 }).limit(5000).toArray()

    // Dedupe: latest doc per (email, assessment, problem) — re-runs overwrite, never double-count
    const latest = new Map<string, any>()
    for (const d of docs) {
      if (!d.candidateEmail) continue
      const key = `${d.candidateEmail}|${d.assessmentId || ''}|${d.problemId || ''}`
      latest.set(key, d)
    }

    // Admin-defined marks per problem (default 1) — points = solve% × marks
    const marksByProblem = new Map<string, number>()
    try {
      const oids: ObjectId[] = []
      for (const d of latest.values()) {
        if (!d.problemId) continue
        try { oids.push(new ObjectId(String(d.problemId))) } catch { /* non-ObjectId id → default 1 */ }
      }
      if (oids.length) {
        const probs = await db.collection('problems').find({ _id: { $in: oids } }, { projection: { marks: 1 } }).toArray()
        for (const p of probs) marksByProblem.set(String(p._id), Number(p.marks) || 1)
      }
    } catch { /* marks lookup best-effort → falls back to 1 */ }

    // Aggregate per candidate
    const byUser = new Map<string, any>()
    for (const d of latest.values()) {
      let u = byUser.get(d.candidateEmail)
      if (!u) {
        u = {
          candidateEmail: d.candidateEmail,
          score: 0,
          maxMarks: 0,
          problemsAttempted: 0,
          problemsPassed: 0,
          tcPassed: 0,
          tcTotal: 0,
          timeSec: 0,
          languages: new Set<string>(),
          lastActive: 0,
          assessmentIds: new Set<string>()
        }
        byUser.set(d.candidateEmail, u)
      }
      const s = Number(d.score) || 0
      const marks = marksByProblem.get(String(d.problemId || '')) || 1
      u.score += s * marks
      u.maxMarks += marks
      u.problemsAttempted += 1
      if (s >= 0.5) u.problemsPassed += 1
      if (Array.isArray(d.results)) {
        u.tcTotal += d.results.length
        for (const r of d.results) if (r && r.passed) u.tcPassed += 1
      }
      // timeTakenSec is elapsed-since-start of the session → MAX across problems is total time
      u.timeSec = Math.max(u.timeSec, Number(d.timeTakenSec) || 0)
      if (d.language && d.language !== 'n/a') u.languages.add(String(d.language))
      const t = new Date(d.lastUpdated || d.createdAt || 0).getTime()
      if (t > u.lastActive) u.lastActive = t
      if (d.assessmentId) u.assessmentIds.add(String(d.assessmentId))
    }

    let rows: any[] = Array.from(byUser.values()).map(u => ({
      candidateEmail: u.candidateEmail,
      score: Math.round(u.score * 100) / 100,
      maxMarks: u.maxMarks,
      problemsAttempted: u.problemsAttempted,
      problemsPassed: u.problemsPassed,
      tcPassed: u.tcPassed,
      tcTotal: u.tcTotal,
      timeSec: u.timeSec,
      languages: Array.from(u.languages) as string[],
      lastActive: u.lastActive,
      assessmentIds: Array.from(u.assessmentIds) as string[]
    }))

    // Rank: points desc → testcases passed desc → less time first → email for stable order
    rows.sort((a, b) =>
      b.score - a.score ||
      b.tcPassed - a.tcPassed ||
      a.timeSec - b.timeSec ||
      a.candidateEmail.localeCompare(b.candidateEmail)
    )
    rows = rows.slice(0, limit)
    rows.forEach((r, i) => { r.rank = i + 1 })

    // Attach name/rollNo for identification (fallback: email only)
    try {
      if (rows.length) {
        const users = await db.collection('users').find(
          { email: { $in: rows.map(r => r.candidateEmail) } },
          { projection: { email: 1, name: 1, rollNumber: 1 } }
        ).toArray()
        const byEmail = new Map(users.map((u: any) => [u.email, u]))
        for (const r of rows) {
          const u = byEmail.get(r.candidateEmail)
          r.name = u?.name || ''
          r.rollNumber = u?.rollNumber || ''
        }
      }
    } catch { /* identification is best-effort */ }
    for (const r of rows) { if (r.name === undefined) r.name = ''; if (r.rollNumber === undefined) r.rollNumber = '' }

    // Summary for the analysis strip
    const summary = {
      participants: rows.length,
      avgScore: rows.length ? Math.round((rows.reduce((s, r) => s + r.score, 0) / rows.length) * 10000) / 10000 : 0,
      topScore: rows.length ? rows[0].score : 0,
      tcPassed: rows.reduce((s, r) => s + r.tcPassed, 0)
    }

    res.json({ leaderboard: rows, summary, assessmentId, limit })
  } catch (e: any) {
    console.error('Leaderboard error:', e?.message)
    res.status(500).json({ error: 'Failed to load leaderboard' })
  }
})

export default router
