import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { executeLocal } from '../lib/localRunner'

const router = Router()

// Rate limiting for code execution — generous for assessment (100/min for local)
const executionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { error: 'Too many execution requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
})

const executeSchema = z.object({
  code: z.string().min(1).max(20000),
  language: z.string().min(1).max(20),
  testcases: z.array(z.object({ input: z.string().max(5000), output: z.string().max(5000) })).min(1).max(20)
})

// Helper: robust output equality (JSON-aware, whitespace-insensitive)
function outputsEqual(actual: string, expected: string): boolean {
  const a = String(actual ?? '').trim()
  const e = String(expected ?? '').trim()
  if (e === '') return true // custom input: no expected
  try {
    const ja = JSON.parse(a)
    const je = JSON.parse(e)
    return JSON.stringify(ja) === JSON.stringify(je)
  } catch {}
  const norm = (s: string) => s.replace(/\r\n/g,'\n').trim().replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n')
  if (norm(a) === norm(e)) return true
  const strip = (s: string) => s.replace(/\s*,\s*/g,',').replace(/\s*\[\s*/g,'[').replace(/\s*\]\s*/g,']').trim()
  return strip(a) === strip(e)
}

// Pure local execution for all languages — no Judge0, no quota
router.post('/execute', executionLimiter, async (req, res) => {
  try {
    const parsed = executeSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
    }
    const { code, language, testcases } = parsed.data

    const results = await Promise.all(
      testcases.map(async (tc) => {
        try {
          const { output, error } = await executeLocal(language, code, tc.input)
          // Normalize output for display
          let out = (output ?? '').toString().trim()
          let err = (error ?? '').toString().trim()
          // If local runner reported compilation/runtime error, surface as output
          if (!out && err) {
            if (err.toLowerCase().includes('compilation') || err.toLowerCase().includes('syntax')) out = 'Compilation error'
            else if (err.toLowerCase().includes('time')) out = 'Time limit exceeded'
            else if (err) out = err.slice(0, 500)
          }
          if (!out) out = 'No output'
          const isCustom = !tc.output || String(tc.output).trim() === ''
          const passed = isCustom ? !err : outputsEqual(out, tc.output || '')
          return {
            testcase: tc.input,
            expected: tc.output,
            output: out,
            passed,
            error: err || null
          }
        } catch (e: any) {
          return {
            testcase: tc.input,
            expected: tc.output,
            output: 'Execution failed',
            passed: false,
            error: e.message || 'Unknown error'
          }
        }
      })
    )

    res.json({ results })
  } catch (error: any) {
    console.error('Code execution error:', error?.message || error)
    res.status(500).json({ error: 'Code execution failed' })
  }
})

export default router
