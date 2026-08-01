import '../loadEnv.js'
import { MongoClient } from 'mongodb'

const MONGODB_URI = process.env.MONGODB_URI ?? '';

// Mongo client (used by better auth)
export const authMongoClient = new MongoClient(MONGODB_URI)
export const authDb = authMongoClient.db()

export async function connectAuthDb(): Promise<void> {
  await authMongoClient.connect()
}

export async function closeAuthDb(): Promise<void> {
  await authMongoClient.close()
}
