import '../loadEnv.js'
import { MongoClient } from 'mongodb'

/**
 * Client MongoDB natif dédié à Better Auth.
 *
 * Better Auth ne réutilise pas la connexion Mongoose ; il lui faut un `MongoClient`
 * du driver natif. Il pointe sur la même base que Mongoose (collections séparées :
 * user / session / account / verification / apikey).
 */
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/slider'

export const authMongoClient = new MongoClient(MONGODB_URI)
export const authDb = authMongoClient.db()

export async function connectAuthDb(): Promise<void> {
  await authMongoClient.connect()
}

export async function closeAuthDb(): Promise<void> {
  await authMongoClient.close()
}
