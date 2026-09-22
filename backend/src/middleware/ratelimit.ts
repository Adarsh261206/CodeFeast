import { rateLimit } from 'express-rate-limit'

export const strictLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, try later' } })
export const runnerLimiter = rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false })
export const authLimiter = rateLimit({ 
  windowMs: 15*60_000, 
  max: 100, // increased for events: 100 per 15min per IP (was 20 - too strict for college NAT / event)
  standardHeaders: true, 
  legacyHeaders: false, 
  message: { error: 'Too many auth attempts, try later' },
  // don't count successful /me checks (called on every page load)
  skip: (req) => req.path === '/me' || req.path.endsWith('/me'),
  // Event mode: if EVENT_MODE=true, double the limit via skip logic (handled via env)
  keyGenerator: (req) => {
    // Use IP + event flag to allow higher limit during events
    const ip = req.ip || req.headers['x-forwarded-for'] as string || 'unknown'
    return process.env.EVENT_MODE === 'true' ? `event-${ip}` : ip
  }
})
// Event mode even more permissive — 300 per 15min when EVENT_MODE=true
export const eventAuthLimiter = rateLimit({
  windowMs: 15*60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, try later' },
  skip: (req) => req.path === '/me' || req.path.endsWith('/me'),
})





