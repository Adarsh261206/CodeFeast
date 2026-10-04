import { Router } from 'express'
import { getDb } from '../lib/db'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '50', 10) || 50, 1), 100)
    const skip = Math.max(parseInt((req.query.skip as string) || '0', 10) || 0, 0)
    const problems = await getDb().collection('problems').find({}, { projection: { hidden_testcases: 0 } }).skip(skip).limit(limit).sort({ createdAt: -1 }).toArray()
    res.json({ problems })
  } catch (e: any) {
    console.error('Problems list error:', e?.message)
    res.status(500).json({ error: 'Failed to load problems' })
  }
})

router.get('/sample', async (_req, res) => {
  try {
    const problem = await getDb().collection('problems').findOne({}, { projection: { hidden_testcases: 0 } })
    if (!problem) return res.status(404).json({ error: 'No problem found' })
    res.json({ problem })
  } catch (e: any) {
    console.error('Sample error:', e?.message)
    res.status(500).json({ error: 'Failed to load sample' })
  }
})

// Full problem (including hidden testcases) — admin only.
// The list endpoint strips hidden_testcases so candidates can never fetch them.
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await getDb().collection('users').findOne({ email: req.user?.email }, { projection: { role: 1 } })
    if ((dbUser?.role || req.user?.role) !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' })
    }
    const { id } = req.params
    let oid: any
    try { oid = new (await import('mongodb')).ObjectId(id) } catch { return res.status(400).json({ error: 'Invalid id' }) }
    const problem = await getDb().collection('problems').findOne({ _id: oid })
    if (!problem) return res.status(404).json({ error: 'Problem not found' })
    res.json({ problem })
  } catch (e: any) {
    console.error('Problem detail error:', e?.message)
    res.status(500).json({ error: 'Failed to load problem' })
  }
})

router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    // Admin check via requireAdmin logic (re-validate DB)
    const { getDb: getDb2 } = await import('../lib/db')
    const dbUser = await getDb2().collection('users').findOne({ email: req.user?.email }, { projection: { role:1 }})
    if ((dbUser?.role || req.user?.role) !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' })
    }

    const { id } = req.params
    let oid: any
    try { oid = new (await import('mongodb')).ObjectId(id) } catch { return res.status(400).json({ error: 'Invalid id' })}
    const result = await getDb().collection('problems').deleteOne({ _id: oid })
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Problem not found' })
    res.json({ ok: true })
  } catch (e: any) {
    console.error('Delete problem error:', e?.message)
    res.status(500).json({ error: 'Failed to delete problem' })
  }
})

export default router


