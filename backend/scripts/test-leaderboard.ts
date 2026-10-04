import { connectDb, getDb } from '../src/lib/db'

async function main() {
  await connectDb()
  const db = getDb()
  const assessmentId = null
  const limit = 100
  const match: any = {}
  if (assessmentId) match.assessmentId = assessmentId

  const docs = await db.collection('reports').find(match).sort({ createdAt: 1 }).limit(5000).toArray()
  console.log('docs:', docs.length)

  const latest = new Map<string, any>()
  for (const d of docs) {
    if (!d.candidateEmail) continue
    const key = `${d.candidateEmail}|${d.assessmentId || ''}|${d.problemId || ''}`
    latest.set(key, d)
  }
  console.log('deduped:', latest.size)

  const { ObjectId } = await import('mongodb')
  const marksByProblem = new Map<string, number>()
  const oids: any[] = []
  for (const d of latest.values()) {
    if (!d.problemId) continue
    try { oids.push(new ObjectId(String(d.problemId))) } catch {}
  }
  if (oids.length) {
    const probs = await db.collection('problems').find({ _id: { $in: oids } }, { projection: { marks: 1 } }).toArray()
    for (const p of probs) marksByProblem.set(String(p._id), Number(p.marks) || 1)
  }
  console.log('marks loaded:', marksByProblem.size, JSON.stringify([...marksByProblem]))

  const byUser = new Map<string, any>()
  for (const d of latest.values()) {
    let u = byUser.get(d.candidateEmail)
    if (!u) {
      u = { candidateEmail: d.candidateEmail, score: 0, maxMarks: 0, problemsAttempted: 0, problemsPassed: 0, tcPassed: 0, tcTotal: 0, timeSec: 0, languages: new Set<string>(), lastActive: 0, assessmentIds: new Set<string>() }
      byUser.set(d.candidateEmail, u)
    }
    const s = Number(d.score) || 0
    const marks = marksByProblem.get(String(d.problemId || '')) || 1
    u.score += s * marks
    u.maxMarks += marks
    u.problemsAttempted += 1
    if (s >= 0.5) u.problemsPassed += 1
    if (Array.isArray(d.results)) {
      u.tcTotal += d.results.length
      for (const r of d.results) if (r && r.passed) u.tcPassed += 1
    }
    u.timeSec = Math.max(u.timeSec, Number(d.timeTakenSec) || 0)
    if (d.language && d.language !== 'n/a') u.languages.add(String(d.language))
    const t = new Date(d.lastUpdated || d.createdAt || 0).getTime()
    if (t > u.lastActive) u.lastActive = t
    if (d.assessmentId) u.assessmentIds.add(String(d.assessmentId))
  }

  let rows: any[] = Array.from(byUser.values()).map(u => ({
    candidateEmail: u.candidateEmail,
    score: Math.round(u.score * 100) / 100,
    maxMarks: u.maxMarks,
    problemsAttempted: u.problemsAttempted,
    problemsPassed: u.problemsPassed,
    tcPassed: u.tcPassed,
    tcTotal: u.tcTotal,
    timeSec: u.timeSec,
    languages: Array.from(u.languages) as string[],
    lastActive: u.lastActive,
    assessmentIds: Array.from(u.assessmentIds) as string[]
  }))
  rows.sort((a, b) => b.score - a.score || b.tcPassed - a.tcPassed || a.timeSec - b.timeSec || a.candidateEmail.localeCompare(b.candidateEmail))
  rows = rows.slice(0, limit)
  rows.forEach((r, i) => { r.rank = i + 1 })
  console.log('rows:', rows.length)

  try {
    if (rows.length) {
      const users = await db.collection('users').find(
        { email: { $in: rows.map(r => r.candidateEmail) } },
        { projection: { email: 1, name: 1, rollNumber: 1 } }
      ).toArray()
      console.log('users matched:', users.length)
      const byEmail = new Map(users.map((u: any) => [u.email, u]))
      for (const r of rows) {
        const u = byEmail.get(r.candidateEmail)
        r.name = u?.name || ''
        r.rollNumber = u?.rollNumber || ''
      }
    }
  } catch (e: any) { console.log('users join FAILED:', e?.message) }

  const summary = {
    participants: rows.length,
    avgScore: rows.length ? Math.round((rows.reduce((s, r) => s + r.score, 0) / rows.length) * 10000) / 10000 : 0,
    topScore: rows.length ? rows[0].score : 0,
    tcPassed: rows.reduce((s, r) => s + r.tcPassed, 0)
  }
  console.log('OK summary:', JSON.stringify(summary))
  console.log('sample row:', JSON.stringify(rows[0] || null))
  process.exit(0)
}

main().catch(e => { console.error('REPRO ERROR:', e?.message, '\n', e?.stack?.split('\n').slice(0,5).join('\n')); process.exit(1) })
