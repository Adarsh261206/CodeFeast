import { readFileSync } from 'fs'
import path from 'path'
import { connectDb, getDb } from '../lib/db'

async function main() {
  await connectDb()
  const p = path.resolve(__dirname, '../seed/sampleProblem.json')
  const data = JSON.parse(readFileSync(p, 'utf-8'))
  await getDb().collection('problems').deleteMany({ title: data.title })
  await getDb().collection('problems').insertOne({ ...data, createdAt: new Date() })
  console.log('Seeded sample problem')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


