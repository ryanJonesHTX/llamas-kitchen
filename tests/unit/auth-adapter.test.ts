import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MongoClient, ObjectId } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { AdapterUser } from 'next-auth/adapters'
import { adapterWithRoles } from '../../lib/authAdapter'

// Exercises the adapter that auth.ts hands to Auth.js against an in-memory
// MongoDB on a random port.

let mongo: MongoMemoryServer
let client: MongoClient

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  client = new MongoClient(mongo.getUri('auth-adapter-test'))
})

afterAll(async () => {
  await client?.close()
  await mongo?.stop()
})

// What Auth.js passes to createUser for a first sign-in: no role yet.
const newUser = (email: string) =>
  ({ id: '', email, emailVerified: null, name: null }) as AdapterUser

async function storedRole(id: string) {
  const doc = await client
    .db()
    .collection('users')
    .findOne({ _id: new ObjectId(id) })
  return doc?.role
}

describe('adapterWithRoles createUser', () => {
  it('stores role admin for an email in ADMIN_EMAILS', async () => {
    const adapter = adapterWithRoles(client, 'other@example.com, Chef@Example.com')
    const user = await adapter.createUser!(newUser('chef@example.com'))

    expect(user.role).toBe('admin')
    expect(await storedRole(user.id)).toBe('admin')
  })

  it('stores role user for any other email', async () => {
    const adapter = adapterWithRoles(client, 'chef@example.com')
    const user = await adapter.createUser!(newUser('guest@example.com'))

    expect(user.role).toBe('user')
    expect(await storedRole(user.id)).toBe('user')
  })
})
