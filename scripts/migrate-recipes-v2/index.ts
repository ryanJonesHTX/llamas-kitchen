// One-time recipe migration to the Phase 2 model. Dry run unless --apply.
//   MONGODB_URI=... node scripts/migrate-recipes-v2/index.ts --admin-user-id <id> [--apply]
// Reads only MONGODB_URI from the environment; no .env file is loaded.
import { parseArgs } from 'node:util'
import { MongoClient } from 'mongodb'
import { migrate } from './migrate.ts'

const uri = process.env.MONGODB_URI
if (!uri) throw new Error('MONGODB_URI is not set. Pass it explicitly for the cluster to migrate.')

const { values } = parseArgs({
  options: { 'admin-user-id': { type: 'string' }, apply: { type: 'boolean', default: false } },
})
const adminUserId = values['admin-user-id']
if (!adminUserId) throw new Error('--admin-user-id <id> is required')

// The host list between "scheme://[credentials@]" and the path; never the credentials or query.
function hostsOf(connectionString: string): string {
  const authority = connectionString.replace(/^mongodb(\+srv)?:\/\//, '').split(/[/?]/)[0]
  return authority.slice(authority.lastIndexOf('@') + 1)
}

const client = new MongoClient(uri)
try {
  const db = client.db()
  console.log(`Target: ${hostsOf(uri)}, database ${db.databaseName}`)
  console.log(values.apply ? 'Mode: apply' : 'Mode: dry run (pass --apply to write)')

  await client.connect()
  const report = await migrate({ db, adminUserId, apply: values.apply })
  console.log(JSON.stringify(report, null, 2))

  if (report.totals.problem > 0) {
    console.log(`${report.totals.problem} recipe(s) have problems. Nothing was written.`)
    process.exitCode = 1
  } else if (values.apply) {
    console.log(`Wrote ${report.totals.convert} recipe(s).`)
  } else {
    console.log('Dry run: nothing was written.')
  }
} finally {
  await client.close()
}
