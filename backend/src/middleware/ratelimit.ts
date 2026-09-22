import { rateLimit } from 'express-rate-limit'

export const strictLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, try later' } })
export const runnerLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false })
export const authLimiter = rateLimit({ windowMs: 15*60_000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many auth attempts, try later' } })





