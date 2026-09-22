import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import problemsRouter from './routes/problems'
import runnerRouter from './routes/runner'
import adminRouter from './routes/admin'
import reportsRouter from './routes/reports'
import assessmentsRouter from './routes/assessments'
import authRouter from './routes/auth'
import { connectDb } from './lib/db'

// Fail-fast if JWT secret missing in production
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('FATAL: JWT_SECRET must be set in production')
  process.exit(1)
}
if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET not set, using insecure dev fallback — do not use in production')
}

const app = express()
// Trust Cloud Run / Google Frontend proxy for correct client IPs
app.set('trust proxy', 1)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false
}))

const allowedOrigins = ([process.env.FRONTEND_URL, process.env.ALLOWED_ORIGINS].filter(Boolean).join(',') || 'http://localhost:5173,http://localhost:5178,http://127.0.0.1:5173,http://127.0.0.1:5178').split(',').map(s=>s.trim()).filter(Boolean)
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true) // allow curl/mobile
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) return cb(null, true)
    return cb(new Error('Not allowed by CORS'))
  },
  credentials: true
}))
app.use(express.json({ limit: '1mb' }))
app.use(morgan('dev'))

// Global rate limiter but skip health
const limiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false, skip: (req) => req.path === '/api/health' })
app.use(limiter)

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// Ensure DB connection for all API routes after health
app.use(async (_req, res, next) => {
  try {
    await connectDb()
    next()
  } catch (e: any) {
    console.error('DB ensure failed:', e?.message || e)
    res.status(500).json({ error: 'Database unavailable' })
  }
})
app.use('/api/auth', authRouter)
app.use('/api/problems', problemsRouter)
app.use('/api/runner', runnerRouter)
app.use('/api/admin', adminRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/assessments', assessmentsRouter)

// Central error handler — sanitize CORS and other errors
app.use((err: any, _req: any, res: any, _next: any) => {
  if (err && err.message && err.message.includes('Not allowed by CORS')) {
    return res.status(403).json({ error: 'CORS not allowed' })
  }
  console.error('Unhandled error:', err?.message || err)
  return res.status(500).json({ error: 'Internal server error' })
})

const port = Number(process.env.PORT || 4000)
app.listen(port, () => console.log(`API listening on :${port}`))

// Kick off background connection for faster cold starts
connectDb()
  .then(() => console.log('DB connected'))
  .catch((e) => console.error('DB connection failed:', e?.message || e))


