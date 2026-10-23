import { MongoClient } from 'mongodb'

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  throw new Error(
    'Please define the MONGODB_URI environment variable inside .env.local'
  )
}

// Cached on globalThis so dev hot reloads reuse one client. The driver
// connects on first use, as the Auth.js MongoDB adapter recommends.
const globalWithMongo = globalThis as typeof globalThis & {
  _mongoClient?: MongoClient
}

const client = (globalWithMongo._mongoClient ??= new MongoClient(MONGODB_URI))

export default client
