// Converts every old-shape recipe in `db`. Validates the whole collection
// first and writes only with `apply` and zero problems.
import { type Collection, type Db, type Document, ObjectId } from 'mongodb'
import { slugify } from '../../lib/slugify.ts'
import { convertRecipe, isMigrated, type MigratedRecipe } from './convert.ts'

export type ReportRecipe = {
  _id: unknown
  name: unknown
  outcome: 'convert' | 'skip' | 'problem'
  problems?: string[]
  slug?: string
  tags?: string[]
  stepCount?: number
  unparsedIngredients?: string[]
  imageSource?: 'cloudinaryId' | 'photo' | 'none'
  // Only when imageSource is 'photo', so the parsed ID can be checked against the URL.
  imagePublicId?: string
  photo?: string
}

export type Report = {
  recipes: ReportRecipe[]
  totals: { convert: number; skip: number; problem: number }
}

async function requireAdmin(db: Db, adminUserId: string): Promise<ObjectId> {
  if (!/^[0-9a-f]{24}$/i.test(adminUserId)) {
    throw new Error(`--admin-user-id is not an ObjectId: ${adminUserId}`)
  }
  const id = new ObjectId(adminUserId)
  const admin = await db.collection('users').findOne({ _id: id, role: 'admin' })
  if (!admin) throw new Error(`No admin user with _id ${adminUserId}`)
  return id
}

// slugify(name), or null when the name can't make a slug (convertRecipe reports the name).
function baseSlug(name: unknown): string | null {
  if (typeof name !== 'string') return null
  try {
    return slugify(name)
  } catch {
    return null
  }
}

// base, then base-2, base-3, ... until it is not taken; records the result as taken.
function claimSlug(base: string, taken: Set<string>): string {
  let slug = base
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`
  taken.add(slug)
  return slug
}

function imageSource(oldDoc: Document, doc: MigratedRecipe): ReportRecipe['imageSource'] {
  if (doc.imagePublicId === undefined) return 'none'
  return typeof oldDoc.cloudinaryId === 'string' && oldDoc.cloudinaryId.trim() ? 'cloudinaryId' : 'photo'
}

// Replaces each recipe only if it is unchanged since it was read (same _id and
// updatedAt; conversion keeps updatedAt). Throws on a deleted or edited recipe.
export async function writeConverted(recipes: Collection, docs: MigratedRecipe[]): Promise<void> {
  for (const doc of docs) {
    const { matchedCount } = await recipes.replaceOne({ _id: doc._id, updatedAt: doc.updatedAt }, doc)
    if (matchedCount !== 1) {
      throw new Error(`Recipe ${doc._id} was deleted or changed during the migration; re-run it`)
    }
  }
}

export async function migrate({
  db,
  adminUserId,
  apply,
}: {
  db: Db
  adminUserId: string
  apply: boolean
}): Promise<Report> {
  const submittedBy = await requireAdmin(db, adminUserId)
  const recipes = db.collection('recipes')
  // createdAt then _id order decides who gets the bare slug, so runs are deterministic.
  const docs = await recipes.find().sort({ createdAt: 1, _id: 1 }).toArray()

  const migrated = docs.filter((doc) => isMigrated(doc))
  const taken = new Set(migrated.map((doc) => doc.slug as string))

  const report: Report = { recipes: [], totals: { convert: 0, skip: 0, problem: 0 } }
  const converted: MigratedRecipe[] = []
  for (const oldDoc of docs) {
    const entry = { _id: oldDoc._id, name: oldDoc.name }
    if (migrated.includes(oldDoc)) {
      report.recipes.push({ ...entry, outcome: 'skip', slug: oldDoc.slug })
      report.totals.skip++
      continue
    }
    const base = baseSlug(oldDoc.name)
    const result = base
      ? convertRecipe(oldDoc, { adminUserId: submittedBy, slug: claimSlug(base, taken) })
      : { problems: [`name has no letters or digits to make a slug: ${JSON.stringify(oldDoc.name)}`] }
    if ('problems' in result) {
      report.recipes.push({ ...entry, outcome: 'problem', problems: result.problems })
      report.totals.problem++
      continue
    }
    const { doc } = result
    converted.push(doc)
    const source = imageSource(oldDoc, doc)
    report.recipes.push({
      ...entry,
      outcome: 'convert',
      slug: doc.slug,
      tags: doc.tags,
      stepCount: doc.steps.length,
      unparsedIngredients: doc.ingredients.filter((i) => i.quantity === null).map((i) => i.item),
      imageSource: source,
      ...(source === 'photo' && { imagePublicId: doc.imagePublicId, photo: oldDoc.photo }),
    })
    report.totals.convert++
  }

  if (apply && report.totals.problem === 0) await writeConverted(recipes, converted)
  return report
}
