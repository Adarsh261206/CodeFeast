import { Router } from 'express'
import { getDb } from '../lib/db'
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth'

const router = Router()

router.get('/', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const db = getDb()
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '50', 10) || 50, 1), 100)
    const skip = Math.max(parseInt((req.query.skip as string) || '0', 10) || 0, 0)
    // Fetch all (capped at 1000) then group, then paginate — correct grouping vs pre-limit
    const submissions = await db.collection('reports').find().sort({ createdAt: -1 }).limit(1000).toArray()
    
    // Group by assessment and user - FIXED: Use proper grouping key
    const groupedReports = new Map()
    
    submissions.forEach(submission => {
      // Create a unique key for each user-assessment combination
      const key = submission.assessmentId 
        ? `${submission.assessmentId}-${submission.candidateEmail}`
        : `no-assessment-${submission.candidateEmail}`
      
      if (!groupedReports.has(key)) {
        groupedReports.set(key, {
          _id: submission._id, // Use first submission's ID
          candidateEmail: submission.candidateEmail,
          assessmentId: submission.assessmentId || null,
          totalTimeTakenSec: 0,
          totalScore: 0,
          totalProblems: 0,
          passedProblems: 0,
          languages: new Set(),
          allResults: [],
          submissions: [] as any[],
          security: {
            tabSwitches: 0,
            fullscreenExits: 0
          },
          createdAt: submission.createdAt,
          lastUpdated: submission.createdAt,
          endedBy: submission.endedBy
        })
      }
      
      const report = groupedReports.get(key)
      
      // Aggregate data properly — time is MAX (elapsed since start), not sum (would double-count)
      report.totalTimeTakenSec = Math.max(report.totalTimeTakenSec, submission.timeTakenSec || 0)
      report.totalScore += submission.score || 0
      report.totalProblems += 1
      
      // FIXED: Proper scoring logic - consider a problem passed if score >= 0.5
      if ((submission.score || 0) >= 0.5) {
        report.passedProblems += 1
      }
      
      // Add language if it exists
      if (submission.language && submission.language !== 'n/a') {
        report.languages.add(submission.language)
      }
      
      // Add results if they exist
      if (submission.results && Array.isArray(submission.results)) {
        report.allResults.push(...submission.results)
      }
      // Preserve code per submission for admin review
      report.submissions.push({
        problemId: submission.problemId || null,
        language: submission.language || 'n/a',
        code: submission.code || '',
        score: submission.score || 0,
        problemTimeSec: submission.problemTimeSec || 0,
        keystrokes: submission.keystrokes || 0,
        pasteEvents: submission.pasteEvents || 0,
        activeTypingSec: submission.activeTypingSec || 0,
        kpm: submission.kpm || 0,
        attempts: submission.attempts || 0,
        avgExecMs: submission.avgExecMs || 0,
        createdAt: submission.createdAt
      })
      
      // Keep earliest createdAt and latest lastUpdated
      if (submission.createdAt < report.createdAt) {
        report.createdAt = submission.createdAt
      }
      if (submission.createdAt > report.lastUpdated) {
        report.lastUpdated = submission.createdAt
      }
      
      // Aggregate security metrics
      if (submission.security) {
        report.security.tabSwitches += submission.security.tabSwitches || 0
        report.security.fullscreenExits += submission.security.fullscreenExits || 0
      }
      
      // Keep the earliest endedBy reason
      if (submission.endedBy && !report.endedBy) {
        report.endedBy = submission.endedBy
      }
    })
    
    // Convert to array and calculate averages with proper error handling
    let reports = Array.from(groupedReports.values()).map(report => {
      const averageScore = report.totalProblems > 0 ? (report.totalScore / report.totalProblems) : 0
      const passRate = report.totalProblems > 0 ? (report.passedProblems / report.totalProblems) : 0
      
      return {
        ...report,
        languages: Array.from(report.languages),
        averageScore: Math.round(averageScore * 10000) / 10000, // Round to 4 decimal places
        passRate: Math.round(passRate * 10000) / 10000,
        // Ensure dates are properly formatted
        createdAt: report.createdAt instanceof Date ? report.createdAt.toISOString() : report.createdAt,
        lastUpdated: report.lastUpdated instanceof Date ? report.lastUpdated.toISOString() : report.lastUpdated
      }
    })
    // Sort by lastUpdated desc and paginate after grouping (correct)
    reports.sort((a:any,b:any)=> new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
    // Attach name/rollNo from users so admin can identify candidates (fallback: email only)
    try {
      const emails = [...new Set(reports.map((r: any) => r.candidateEmail).filter(Boolean))] as string[]
      if (emails.length) {
        const users = await db.collection('users')
          .find({ email: { $in: emails } }, { projection: { email: 1, name: 1, rollNumber: 1 } })
          .toArray()
        const byEmail = new Map(users.map((u: any) => [u.email, u]))
        for (const r of reports as any[]) {
          const u = byEmail.get(r.candidateEmail)
          if (u) {
            r.candidateName = u.name || ''
            r.rollNumber = u.rollNumber || ''
          }
        }
      }
    } catch { /* identification is best-effort — reports still return */ }
    const total = reports.length
    const paged = reports.slice(skip, skip+limit)
    res.json({ reports: paged, total, limit, skip })
  } catch (e: any) {
    console.error('Reports API error:', e?.message)
    res.status(500).json({ error: 'Failed to load reports' })
  }
})

router.post('/submit', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  // Deprecated direct submit — now admin only to prevent arbitrary score injection
  // Normal assessment submits go via /api/assessments/submit which re-executes code server-side
  const { candidateEmail: bodyEmail, assessmentId, problemId, timeTakenSec, score, language, results, code } = req.body
  const candidateEmail = bodyEmail ? String(bodyEmail).toLowerCase().trim().slice(0,254) : req.user?.email
  if (!candidateEmail) return res.status(401).json({ error: 'Unauthorized' })
  if (typeof score === 'number' && (score < 0 || score > 1)) return res.status(400).json({ error: 'Invalid score' })
  const doc: any = { 
    candidateEmail, 
    assessmentId: assessmentId ? String(assessmentId).slice(0,100) : null,
    problemId: problemId ? String(problemId).slice(0,100) : null,
    timeTakenSec: Number(timeTakenSec)||0, 
    score: Number(score)||0, 
    language: String(language||'n/a').slice(0,20), 
    code: code ? String(code).slice(0, 30000) : '',
    results: Array.isArray(results)? results.slice(0,50):[], 
    createdAt: new Date() 
  }
  await getDb().collection('reports').insertOne(doc)
  res.json({ ok: true })
})

router.post('/force-end', requireAuth, async (req: AuthRequest, res) => {
  const { reason, assessmentId, problemId, security, language, timeTakenSec } = req.body
  await getDb().collection('events').insertOne({ type: 'force_end', reason, assessmentId: assessmentId || null, problemId: problemId || null, security, candidateEmail: req.user?.email, createdAt: new Date() })
  // also append a minimal report row so UI can show the violation even without submission
  try {
    const doc: any = {
      candidateEmail: req.user?.email || 'unknown',
      assessmentId: assessmentId || null,
      problemId: problemId || null,
      timeTakenSec: typeof timeTakenSec === 'number' ? timeTakenSec : 0,
      score: 0,
      language: language || 'n/a',
      results: [],
      createdAt: new Date(),
      security: security || undefined,
      endedBy: { reason, at: new Date() }
    }
    await getDb().collection('reports').insertOne(doc)
  } catch {}
  res.json({ ok: true })
})

// Delete a single grouped report by id (admin only) — deletes all submissions for that user+assessment
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    let oid: any
    try { oid = new (await import('mongodb')).ObjectId(id) } catch { return res.status(400).json({ error: 'Invalid id' })}
    const col = getDb().collection('reports')
    const target = await col.findOne({ _id: oid }, { projection: { candidateEmail:1, assessmentId:1 } })
    if (!target) return res.status(404).json({ error: 'Report not found' })
    // Build filter for grouped delete — handle null/missing correctly
    let result: any
    if (target.assessmentId) {
      result = await col.deleteMany({ candidateEmail: target.candidateEmail, assessmentId: target.assessmentId })
    } else {
      // No assessment: match null or missing
      result = await col.deleteMany({ 
        candidateEmail: target.candidateEmail, 
        $or: [{ assessmentId: null }, { assessmentId: { $exists: false } }] 
      })
    }
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Report not found' })
    // Also clean related submissions for consistency
    try {
      if (target.assessmentId) {
        await getDb().collection('submissions').deleteMany({ userId: target.candidateEmail, assessmentId: target.assessmentId })
      } else {
        await getDb().collection('submissions').deleteMany({ userId: target.candidateEmail, $or: [{ assessmentId: null }, { assessmentId: { $exists: false } }] })
      }
    } catch {}
    res.json({ ok: true, deletedCount: result.deletedCount })
  } catch (e: any) {
    console.error('Delete report error:', e?.message)
    res.status(500).json({ error: 'Failed to delete report' })
  }
})

// Bulk delete all reports (admin only)
router.delete('/', requireAuth, requireAdmin, async (_req, res) => {
  try {
    await getDb().collection('reports').deleteMany({})
    // Also clean submissions for consistency
    try { await getDb().collection('submissions').deleteMany({}) } catch {}
    try { await getDb().collection('events').deleteMany({}) } catch {}
    res.json({ ok: true })
  } catch (e: any) {
    console.error('Bulk delete error:', e?.message)
    res.status(500).json({ error: 'Failed to delete reports' })
  }
})

export default router



