import '../loadEnv.js'
import { MongoClient } from 'mongodb'

const MONGODB_URI = process.env.MONGODB_URI ?? '';

// Mongo client (used by better auth)
export const authMongoClient = new MongoClient(MONGODB_URI)
export const authDb = authMongoClient.db()

// Whether the server takes transactions — a replica set member or a mongos
// does, a single standalone mongod refuses them — read once connected. Off
// until then: an instance built before the connection runs without them,
// which works on any server.
let transactionsSupported = false

export async function connectAuthDb(): Promise<void> {
  await authMongoClient.connect()
  const hello = await authDb.command({ hello: 1 })
  transactionsSupported = typeof hello.setName === 'string' || hello.msg === 'isdbgrid'
  if (!transactionsSupported) {
    console.warn(
      'MongoDB is a standalone server, not a replica set: account changes run without transactions. ' +
      'A failure between two writes of a sign-up can leave an account half made.'
    )
  }
}

/** Whether better-auth may run its writes in transactions: see `connectAuthDb`. */
export function authDbSupportsTransactions(): boolean {
  return transactionsSupported
}

export async function closeAuthDb(): Promise<void> {
  await authMongoClient.close()
}
