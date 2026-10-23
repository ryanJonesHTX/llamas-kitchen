import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  throw new Error(
    'Please define the MONGODB_URI environment variable inside .env.local'
  )
}

/**
 * Cached on globalThis so dev hot reloads and concurrent requests share one
 * connection instead of opening a new one each time.
 */
const cached = (globalThis.mongoose ??= { conn: null, promise: null })

async function dbConnect() {
  if (cached.conn) {
    return cached.conn
  }

  cached.promise ??= mongoose.connect(MONGODB_URI, { bufferCommands: false })

  try {
    cached.conn = await cached.promise
  } catch (e) {
    cached.promise = null
    throw e
  }

  return cached.conn
}

export default dbConnect
