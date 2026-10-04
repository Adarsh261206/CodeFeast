import { Router } from 'express'
import { getDb } from '../lib/db'
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth'

const router = Router()

// Get all assessments
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '50', 10) || 50, 1), 100)
    const skip = Math.max(parseInt((req.query.skip as string) || '0', 10) || 0, 0)
    const assessments = await getDb().collection('assessments').find({}).skip(skip).limit(limit).sort({ createdAt: -1 }).toArray()
    res.json({ assessments })
  } catch (e: any) {
    console.error('Assessments list error:', e?.message)
    res.status(500).json({ error: 'Failed to load assessments' })
  }
})

// Get specific assessment
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    let oid: any
    try { oid = new (await import('mongodb')).ObjectId(id) } catch { return res.status(400).json({ error: 'Invalid id' })}
    const assessment = await getDb().collection('assessments').findOne({ 
      _id: oid
    })
    
    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' })
    }
    
    res.json({ assessment })
  } catch (e: any) {
    console.error('Get assessment error:', e?.message)
    res.status(500).json({ error: 'Failed to load assessment' })
  }
})

// Create assessment (admin only)
router.post('/', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { title, description, duration, startDate, endDate, problems } = req.body
    
    if (!title || !description || !duration || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing required fields' })
    }
    const dur = Number(duration)
    if (!Number.isFinite(dur) || dur < 5 || dur > 480) return res.status(400).json({ error: 'Duration must be 5-480 minutes' })
    const sd = new Date(startDate)
    const ed = new Date(endDate)
    if (isNaN(sd.getTime()) || isNaN(ed.getTime())) return res.status(400).json({ error: 'Invalid dates' })
    if (ed <= sd) return res.status(400).json({ error: 'End date must be after start date' })
    if (!Array.isArray(problems) || problems.length === 0) return res.status(400).json({ error: 'At least one problem required' })

    const assessment = {
      title: String(title).slice(0,200).trim(),
      description: String(description).slice(0,2000).trim(),
      duration: dur,
      startDate: sd,
      endDate: ed,
      problems: problems.map((p:any)=> String(p).slice(0,100)),
      isActive: true,
      createdAt: new Date(),
      createdBy: req.user?.email
    }

    const { insertedId } = await getDb().collection('assessments').insertOne(assessment)
    res.json({ ok: true, id: insertedId, assessment: { _id: insertedId, ...assessment } })
  } catch (e: any) {
    console.error('Create assessment error:', e?.message)
    res.status(500).json({ error: 'Failed to create assessment' })
  }
})

// Update assessment (admin only)
router.put('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    let oid: any
    try { oid = new (await import('mongodb')).ObjectId(id) } catch { return res.status(400).json({ error: 'Invalid id' })}
    const updateData = req.body
    // whitelist fields
    const allowed: any = {}
    if (typeof updateData.title === 'string') allowed.title = String(updateData.title).slice(0,200)
    if (typeof updateData.description === 'string') allowed.description = String(updateData.description).slice(0,2000)
    if (updateData.duration !== undefined) {
      const d = Number(updateData.duration)
      if (!Number.isFinite(d) || d < 5 || d > 480) return res.status(400).json({ error: 'Invalid duration' })
      allowed.duration = d
    }
    if (updateData.startDate) { const sd=new Date(updateData.startDate); if(isNaN(sd.getTime())) return res.status(400).json({ error: 'Invalid startDate'}); allowed.startDate=sd }
    if (updateData.endDate) { const ed=new Date(updateData.endDate); if(isNaN(ed.getTime())) return res.status(400).json({ error: 'Invalid endDate'}); allowed.endDate=ed }
    if (Array.isArray(updateData.problems)) allowed.problems = updateData.problems.map((p:any)=> String(p).slice(0,100))
    if (Object.keys(allowed).length===0) return res.status(400).json({ error: 'No valid fields to update'})
    
    const result = await getDb().collection('assessments').updateOne(
      { _id: oid },
      { $set: { ...allowed, updatedAt: new Date() } }
    )
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Assessment not found' })
    }
    
    res.json({ ok: true })
  } catch (e: any) {
    console.error('Update assessment error:', e?.message)
    res.status(500).json({ error: 'Failed to update assessment' })
  }
})

// Delete assessment (admin only)
router.delete('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    let oid: any
    try { oid = new (await import('mongodb')).ObjectId(id) } catch { return res.status(400).json({ error: 'Invalid id' })}
    
    const result = await getDb().collection('assessments').deleteOne(
      { _id: oid }
    )
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Assessment not found' })
    }
    
    res.json({ ok: true })
  } catch (e: any) {
    console.error('Delete assessment error:', e?.message)
    res.status(500).json({ error: 'Failed to delete assessment' })
  }
})

// Submit assessment — PURE LOCAL, never trust client results for scoring
router.post('/submit', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { assessmentId, problemId, language, code, timeTakenSec, security } = req.body as {
      assessmentId?: string
      problemId: string
      language: string
      code: string
      timeTakenSec?: number
      security?: { tabSwitches?: number; fullscreenExits?: number }
    }
    // Note: client-provided `results` is IGNORED for scoring to prevent bypass — server re-executes
    const { z: zod } = await import('zod')
    const bodySchema = zod.object({
      assessmentId: zod.string().max(100).optional(),
      problemId: zod.string().min(1).max(100),
      language: zod.string().min(1).max(20),
      code: zod.string().min(1).max(30000),
      results: zod.array(zod.any()).max(50).optional(), // accepted but ignored
      timeTakenSec: zod.number().min(0).max(86400).optional(),
      problemTimeSec: zod.number().min(0).max(86400).optional(),
      keystrokes: zod.number().min(0).max(1000000).optional(),
      pasteEvents: zod.number().min(0).max(100000).optional(),
      activeTypingSec: zod.number().min(0).max(86400).optional(),
      kpm: zod.number().min(0).max(10000).optional(),
      attempts: zod.number().min(0).max(10000).optional(),
      avgExecMs: zod.number().min(0).max(600000).optional(),
      security: zod.object({ tabSwitches: zod.number().optional(), fullscreenExits: zod.number().optional() }).optional()
    })
    const parsed = bodySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() })
    const { problemTimeSec, keystrokes, pasteEvents, activeTypingSec, kpm, attempts, avgExecMs } = parsed.data
    let oid: any
    try { oid = new (await import('mongodb')).ObjectId(problemId) } catch { return res.status(400).json({ error: 'Invalid problemId' })}
    const problem = await getDb().collection('problems').findOne({ 
      _id: oid
    })
    
    if (!problem) {
      return res.status(404).json({ error: 'Problem not found' })
    }

    // Always execute server-side with pure local runner against ALL testcases (visible + hidden)
    // This prevents test bypass where client sends fake passed results
    const testcases = [...(problem.visible_testcases || []), ...(problem.hidden_testcases || [])]
    const { executeLocal } = await import('../lib/localRunner')
    // Helper for output equality (same as runner)
    const outputsEqual = (a: string, e: string) => {
      const sa = String(a ?? '').trim(); const se = String(e ?? '').trim()
      if (se === '') return true
      try { return JSON.stringify(JSON.parse(sa)) === JSON.stringify(JSON.parse(se)) } catch {}
      const strip = (s: string) => s.replace(/\s*,\s*/g,',').replace(/\s*\[\s*/g,'[').replace(/\s*\]\s*/g,']').trim()
      return strip(sa) === strip(se)
    }
    let finalResults: any[] = []
    // If no testcases (edge), mark as 0
    if (testcases.length === 0) {
      finalResults = []
    } else {
      finalResults = await Promise.all(testcases.map(async (t: any) => {
        const execStart = Date.now()
        try {
          const { output, error } = await executeLocal(language, code, t.input)
          const execMs = Date.now() - execStart
          const out = (output ?? '').toString().trim()
          const err = (error ?? '').toString().trim()
          let actual = out
          if (!actual && err) {
            if (err.toLowerCase().includes('compilation')) actual = 'Compilation error'
            else if (err.toLowerCase().includes('time')) actual = 'Time limit exceeded'
            else actual = err.slice(0, 500) || 'Runtime error'
          }
          if (!actual) actual = 'No output'
          const passed = !err && outputsEqual(actual, t.output || '')
          return { testcase: t.input, expected: t.output, output: actual, passed, error: err || null, execMs }
        } catch (e: any) {
          return { testcase: t.input, expected: t.output, output: 'Execution failed', passed: false, error: e.message, execMs: Date.now() - execStart }
        }
      }))
    }

    // Calculate score
    const passedCount = finalResults.filter((r: any) => r.passed).length
    const totalCount = finalResults.length
    // Store score as fraction [0,1]
    const score = totalCount > 0 ? (passedCount / totalCount) : 0

    // Store submission
    const submission = {
      assessmentId,
      problemId,
      userId: req.user?.email,
      language,
      code,
      results: finalResults,
      score,
      passedCount,
      totalCount,
      submittedAt: new Date(),
      timeTakenSec: typeof timeTakenSec === 'number' ? timeTakenSec : undefined,
      problemTimeSec: typeof problemTimeSec === 'number' ? problemTimeSec : undefined,
      keystrokes: typeof keystrokes === 'number' ? keystrokes : undefined,
      pasteEvents: typeof pasteEvents === 'number' ? pasteEvents : undefined,
      activeTypingSec: typeof activeTypingSec === 'number' ? activeTypingSec : undefined,
      kpm: typeof kpm === 'number' ? kpm : undefined,
      attempts: typeof attempts === 'number' ? attempts : undefined,
      avgExecMs: typeof avgExecMs === 'number' ? avgExecMs : undefined,
      security: security || undefined
    }

    await getDb().collection('submissions').insertOne(submission)
    
    // Also write a lightweight report entry consumed by the Reports page — include code for admin review
    try {
      const reportDoc: any = {
        candidateEmail: req.user?.email,
        assessmentId: assessmentId || null,
        problemId,
        timeTakenSec: typeof timeTakenSec === 'number' ? timeTakenSec : 0,
        problemTimeSec: typeof problemTimeSec === 'number' ? problemTimeSec : 0,
        keystrokes: typeof keystrokes === 'number' ? keystrokes : 0,
        pasteEvents: typeof pasteEvents === 'number' ? pasteEvents : 0,
        activeTypingSec: typeof activeTypingSec === 'number' ? activeTypingSec : 0,
        kpm: typeof kpm === 'number' ? kpm : 0,
        attempts: typeof attempts === 'number' ? attempts : 0,
        avgExecMs: typeof avgExecMs === 'number' ? avgExecMs : 0,
        score, // fraction
        language,
        code: String(code).slice(0, 30000),
        results: finalResults,
        security: {
          tabSwitches: security?.tabSwitches ?? 0,
          fullscreenExits: security?.fullscreenExits ?? 0
        },
        createdAt: new Date()
      }
      await getDb().collection('reports').insertOne(reportDoc)
    } catch (e) {
      // Non-fatal: do not block submission response if report insert fails
      console.warn('Failed to insert report document:', (e as any)?.message)
    }

    res.json({ 
      ok: true, 
      score: Number(score.toFixed(4)),
      passedCount,
      totalCount
    })
  } catch (e: any) {
    console.error('Submit error:', e?.message)
    res.status(500).json({ error: 'Submission failed' })
  }
})

export default router
