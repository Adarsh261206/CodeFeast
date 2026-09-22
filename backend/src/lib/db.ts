import { MongoClient, Db } from 'mongodb'

let db: Db | null = null
let client: MongoClient | null = null

export async function connectDb() {
  if (db) return db
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
  if (!client) client = new MongoClient(uri, { maxPoolSize: 10 })
  try { await client.connect() } catch (e: any) {
    // if already connected, ignore
    if (!e.message?.includes('already')) throw e
  }
  db = client.db(process.env.MONGODB_DB || 'codefeast')
  await ensureIndexes()
  return db
}

export function getDb(): Db {
  if (!db) throw new Error('DB not connected')
  return db
}

async function ensureIndexes() {
  const database = getDb()
  await database.collection('problems').createIndex({ title: 1 }, { unique: true })
  await database.collection('reports').createIndex({ candidateEmail: 1, createdAt: -1 })
  await database.collection('reports').createIndex({ assessmentId: 1, candidateEmail: 1 })
  await database.collection('users').createIndex({ email: 1 }, { unique: true })
  await database.collection('assessments').createIndex({ createdAt: -1 })
  await database.collection('submissions').createIndex({ userId: 1, assessmentId: 1, submittedAt: -1 })
  await database.collection('events').createIndex({ createdAt: -1 })
}





