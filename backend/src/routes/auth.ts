import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { getDb } from '../lib/db'
import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
import { authLimiter, eventAuthLimiter } from '../middleware/ratelimit'

const router = Router()
const isEventMode = process.env.EVENT_MODE === 'true'
// During events, use 300/15min instead of 100/15min — prevents "Too many auth attempts" for college NAT
const activeAuthLimiter = isEventMode ? eventAuthLimiter : authLimiter

// Google OAuth client (optional; set GOOGLE_CLIENT_ID to enable)
const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null

function getJwtSecret(): string {
  const s = process.env.JWT_SECRET
  if (!s) {
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET not configured')
    console.warn('Using dev JWT secret')
    return 'dev-secret-key'
  }
  return s
}
const signJwt = (payload: { email: string; role: string }) =>
  jwt.sign(payload, getJwtSecret(), { expiresIn: '24h' })

const emailSchema = z.string().email().max(254).transform(s=>s.toLowerCase().trim())
const passwordSchema = z.string().min(8).max(128)
const nameSchema = z.string().trim().min(2).max(100)
const rollNumberSchema = z.string().trim().min(1).max(30)

// Helpers
async function findUserByEmail(email: string) {
  return getDb().collection('users').findOne({ email })
}

async function createUser(email: string, passwordHash: string, role: 'admin'|'user' = 'user', profile?: { name?: string; rollNumber?: string }) {
  const userDoc = {
    email, passwordHash, role,
    name: profile?.name || '',
    rollNumber: profile?.rollNumber || '',
    createdAt: new Date()
  }
  await getDb().collection('users').createIndex({ email: 1 }, { unique: true })
  await getDb().collection('users').createIndex({ rollNumber: 1 }, { sparse: true })
  const res = await getDb().collection('users').insertOne(userDoc)
  return { _id: res.insertedId, ...userDoc }
}

// Register with email/password — limiter per-route so /me is never limited (event: 300/15min else 100/15min)
router.post('/register', activeAuthLimiter, async (req, res) => {
  try {
    const parsed = z.object({
      email: emailSchema,
      password: passwordSchema,
      name: nameSchema,
      rollNumber: rollNumberSchema
    }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid details — name (min 2 chars), roll no and password (min 8 chars) are required', details: parsed.error.flatten() })
    const { email, password, name, rollNumber } = parsed.data
    const existing = await findUserByEmail(email)
    if (existing) {
      return res.status(409).json({ error: 'Account already exists' })
    }
    const dupRoll = await getDb().collection('users').findOne({ rollNumber })
    if (dupRoll) return res.status(409).json({ error: 'Roll No already registered' })
    const passwordHash = await bcrypt.hash(password, 10)
    // Secure admin seeding: only email in SEED_ADMIN_EMAIL can become admin on first user, otherwise user
    const usersCount = await getDb().collection('users').countDocuments()
    const seedAdmin = (process.env.SEED_ADMIN_EMAIL || '').toLowerCase().trim()
    let role: 'admin'|'user' = 'user'
    if (usersCount === 0) {
      if (seedAdmin && email === seedAdmin) role = 'admin'
      else if (!seedAdmin) {
        // backward compat: first user admin but warn
        console.warn('First user becoming admin (no SEED_ADMIN_EMAIL set)')
        role = 'admin'
      }
    }
    const created = await createUser(email, passwordHash, role, { name, rollNumber })
    const token = signJwt({ email: created.email, role: created.role })
    res.json({ token, user: { email: created.email, role: created.role, name: created.name, rollNumber: created.rollNumber } })
  } catch (e: any) {
    console.error('Register error:', e?.message)
    res.status(500).json({ error: 'Registration failed' })
  }
})

router.post('/login', activeAuthLimiter, async (req, res) => {
  try {
    const parsed = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid credentials format', details: parsed.error.flatten() })
    const { email, password } = parsed.data
    const user = await findUserByEmail(email)
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
    const token = signJwt({ email: user.email, role: user.role || 'user' })
    res.json({ token, user: { email: user.email, role: user.role || 'user', name: user.name || '', rollNumber: user.rollNumber || '' } })
  } catch (e: any) {
    console.error('Login error:', e?.message)
    res.status(500).json({ error: 'Login failed' })
  }
})

// Google sign-in using ID token (frontend obtains credential via Google Identity Services)
router.post('/google', activeAuthLimiter, async (req, res) => {
  try {
    const parsed = z.object({ idToken: z.string().min(10).max(5000) }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Missing idToken' })
    const { idToken } = parsed.data
    if (!googleClient) return res.status(400).json({ error: 'Google auth not configured' })
    const ticket = await googleClient.verifyIdToken({ idToken, audience: googleClientId })
    const payload = ticket.getPayload()
    if (!payload?.email) return res.status(400).json({ error: 'Invalid Google token' })
    const email = payload.email.toLowerCase().trim()
    let user = await findUserByEmail(email)
    if (!user) {
      // Create user without passwordHash field at all
      const usersCount = await getDb().collection('users').countDocuments()
      const seedAdmin = (process.env.SEED_ADMIN_EMAIL || '').toLowerCase().trim()
      let role: 'admin'|'user' = 'user'
      if (usersCount === 0) {
        if (seedAdmin && email === seedAdmin) role = 'admin'
        else if (!seedAdmin) { console.warn('First Google user becoming admin'); role='admin' }
      }
      // create without passwordHash
      const userDoc: any = { email, role, createdAt: new Date(), provider: 'google' }
      if (payload.name) userDoc.name = payload.name
      await getDb().collection('users').createIndex({ email: 1 }, { unique: true })
      const resInsert = await getDb().collection('users').insertOne(userDoc)
      user = { _id: resInsert.insertedId, ...userDoc }
    }
    if (!user) return res.status(500).json({ error: 'Failed to create user' })
    const token = signJwt({ email: (user as any).email, role: (user as any).role || 'user' })
    res.json({ token, user: { email: (user as any).email, role: (user as any).role || 'user' } })
  } catch (e: any) {
    console.error('Google auth error:', e?.message)
    res.status(500).json({ error: 'Google auth failed' })
  }
})

router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }

  const token = authHeader.substring(7)
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any
    // Validate against DB for fresh role
    const dbUser = await getDb().collection('users').findOne({ email: decoded.email }, { projection: { email:1, role:1, name:1, rollNumber:1 } })
    if (!dbUser) return res.status(401).json({ error: 'User not found' })
    res.json({ user: { email: dbUser.email, role: dbUser.role || decoded.role || 'user', name: dbUser.name || '', rollNumber: dbUser.rollNumber || '' } })
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' })
  }
})

export default router
