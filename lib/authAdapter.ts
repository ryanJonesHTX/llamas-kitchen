import type { Adapter } from 'next-auth/adapters'
import { MongoDBAdapter } from '@auth/mongodb-adapter'
import type { MongoClient } from 'mongodb'
import { roleForEmail } from './roles'

// The MongoDB adapter, with the role assigned once, when the user is created.
export function adapterWithRoles(
  client: MongoClient,
  adminEmails: string | undefined
): Adapter {
  const adapter = MongoDBAdapter(client)
  return {
    ...adapter,
    createUser: (user) =>
      adapter.createUser!({ ...user, role: roleForEmail(user.email, adminEmails) }),
  }
}
