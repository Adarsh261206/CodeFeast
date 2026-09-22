import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthRequest extends Request {
  user?: { email: string; role: string }
}

function getJwtSecret(): string {
  const s = process.env.JWT_SECRET
  if (!s) {
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET not configured')
    return 'dev-secret-key'
  }
  return s
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }

  const token = authHeader.substring(7)
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any
    if (!decoded.email || !decoded.role) return res.status(401).json({ error: 'Invalid token payload' })
    req.user = { email: decoded.email, role: decoded.role }
    next()
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' })
  // Re-validate role from DB to avoid trusting stale JWT claim alone
  try {
    const { getDb } = await import('../lib/db')
    const dbUser = await getDb().collection('users').findOne({ email: req.user.email }, { projection: { role: 1 } })
    const actualRole = dbUser?.role || req.user.role
    if (actualRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' })
    }
    // sync role if DB differs
    req.user.role = actualRole
    next()
  } catch {
    // fallback to JWT role if DB unavailable
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' })
    next()
  }
}
