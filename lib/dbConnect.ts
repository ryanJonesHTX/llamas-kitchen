import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  throw new Error(
    'Please define the MONGODB_URI environment variable inside .env.local'
  )
}

// The check above doesn't narrow inside the hoisted dbConnect below.
const uri: string = MONGODB_URI

type MongooseCache = {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

const globalWithMongoose = globalThis as typeof globalThis & {
  mongoose?: MongooseCache
}

/**
 * Cached on globalThis so dev hot reloads and concurrent requests share one
 * connection instead of opening a new one each time.
 */
const cached = (globalWithMongoose.mongoose ??= { conn: null, promise: null })

async function dbConnect(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn
  }

  cached.promise ??= mongoose.connect(uri, { bufferCommands: false })

  try {
    cached.conn = await cached.promise
  } catch (e) {
    cached.promise = null
    throw e
  }

  return cached.conn
}

export default dbConnect
