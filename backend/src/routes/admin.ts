import { Router } from 'express'
import { z } from 'zod'
import { getDb } from '../lib/db'
import OpenAI from 'openai'
import { strictLimiter } from '../middleware/ratelimit'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

const problemSchema = z.object({
  title: z.string().min(3).max(200),
  statement: z.string().min(10).max(10000),
  constraints: z.string().max(2000).optional().default(''),
  examples: z.array(z.object({ input: z.string().min(1).max(2000), output: z.string().min(1).max(2000) })).min(1).max(10),
  visible_testcases: z.array(z.object({ input: z.string().min(1).max(2000), output: z.string().min(1).max(2000) })).min(1).max(20),
  hidden_testcases: z.array(z.object({ input: z.string().min(1).max(2000), output: z.string().min(1).max(2000) })).min(1).max(30)
})

router.post('/generate', requireAuth, strictLimiter, async (req: AuthRequest, res) => {
  try {
    // Check if user is admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' })
    }

    const { topic } = req.body as { topic?: string }
    const openaiKey = process.env.OPENAI_API_KEY
    if (!openaiKey) return res.status(400).json({ error: 'OPENAI_API_KEY not configured' })

    const client = new OpenAI({ apiKey: openaiKey })
    const sys = `You are a DSA problem generator. Return ONLY JSON with keys title, statement, constraints, examples, visible_testcases, hidden_testcases. Ensure at least 3 visible and 5 hidden cases.`
    const prompt = `Generate a hard DSA problem${topic ? ' about ' + topic : ''} in the exact JSON shape.`
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    })
    const content = completion.choices[0]?.message?.content || '{}'
    function coerceJson(text: string): unknown {
      try {
        return JSON.parse(text)
      } catch (_) {
        // fenced code block
        const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
        if (fence) {
          try { return JSON.parse(fence[1]) } catch {}
        }
        // substring between first { and last }
        const first = text.indexOf('{')
        const last = text.lastIndexOf('}')
        if (first !== -1 && last !== -1 && last > first) {
          const slice = text.slice(first, last + 1)
          try { return JSON.parse(slice) } catch {}
        }
        throw new Error('Could not parse JSON from model output')
      }
    }
    try {
      const parsed = problemSchema.parse(coerceJson(content))
      const { insertedId } = await getDb().collection('problems').insertOne({ ...parsed, createdAt: new Date() })
      res.json({ ok: true, id: insertedId, problem: { _id: insertedId, ...parsed } })
    } catch (e: any) {
      res.status(400).json({ error: 'Malformed JSON from AI', detail: e.message, raw: content })
    }
  } catch (e: any) {
    console.error('Admin generate error:', e?.message)
    res.status(500).json({ error: 'Failed to generate problem' })
  }
})

router.post('/problems', requireAuth, async (req: AuthRequest, res) => {
  try {
    // Check if user is admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' })
    }

    const parsed = problemSchema.parse(req.body)
    const { insertedId } = await getDb().collection('problems').insertOne({ ...parsed, createdAt: new Date() })
    res.json({ ok: true, id: insertedId })
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: e.flatten() })
    if (e.code === 11000) return res.status(409).json({ error: 'Problem with this title already exists' })
    console.error('Create problem error:', e?.message)
    res.status(400).json({ error: e.message || 'Failed to create problem' })
  }
})

export default router


