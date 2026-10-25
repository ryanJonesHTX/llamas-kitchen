import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import mongoose, { Types } from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { adminId, day, pendingDoc, recipeDoc, rejectedDoc } from '../fixtures/recipes'
import { MAX_PENDING_PER_USER } from '../../lib/constants'
import { signUploadParams } from '../../lib/uploadSignature'
import { ALLOWED_FORMATS, MAX_UPLOAD_BYTES, UPLOAD_FOLDER, UPLOAD_TRANSFORMATION } from '../../lib/uploads'

// The server actions in app/recipes/actions.ts against an in-memory MongoDB
// and the real recipe model. Only the session (auth.ts pulls in next-auth),
// next/navigation (imported by lib/guards) and Cloudinary (global fetch)
// are faked.

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }))
vi.mock('../../auth', () => ({ auth }))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect() must not be called by a server action')
  }),
  notFound: vi.fn(() => {
    throw new Error('notFound() must not be called by a server action')
  }),
}))

// The real uniqueSlug, wrapped so the slug race test can make it return a slug
// another recipe already holds.
vi.mock('../../lib/recipes/slug', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/recipes/slug')>()
  return { uniqueSlug: vi.fn(actual.uniqueSlug) }
})

const cloudinaryEnv = {
  CLOUDINARY_CLOUD_NAME: 'unit-cloud',
  CLOUDINARY_API_KEY: 'unit-api-key',
  CLOUDINARY_API_SECRET: 'unit-api-secret-do-not-leak',
}
const CLOUDINARY_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/unit-cloud/image/upload'

const sessionFor = (role: 'user' | 'admin', id: Types.ObjectId) => ({
  expires: '2999-01-01T00:00:00.000Z',
  user: { id: id.toHexString(), name: role, email: `${role}@example.com`, image: null, role },
})
// The admin signed in for these tests is not the fixtures' adminId, so a kept
// submittedBy can be told apart from one overwritten with the current user.
const actingAdminId = new Types.ObjectId('64b0000000000000000000aa')
const adminSession = sessionFor('admin', actingAdminId)
const userId = new Types.ObjectId('64b0000000000000000000bb')
const userSession = sessionFor('user', userId)

const unauthorized = [
  { label: 'no session', session: null },
  { label: 'a user session', session: userSession },
]

let mongo: MongoMemoryServer
let actions: typeof import('../../app/recipes/actions')
let Recipe: typeof import('../../lib/recipes/model').Recipe
let uniqueSlug: typeof import('../../lib/recipes/slug').uniqueSlug
const fetchMock = vi.fn<typeof fetch>()

type Input = Record<string, unknown>

function validInput(overrides: Input = {}): Input {
  return {
    name: 'Beef Stew',
    description: 'Hearty and warm.',
    ingredients: [
      { quantity: 2, unit: 'cups', item: 'beef stock' },
      { quantity: null, unit: null, item: 'Salt to taste' },
    ],
    steps: ['Brown the beef.', 'Simmer for two hours.'],
    servings: 4,
    prepTime: 20,
    cookTime: 120,
    tags: ['main dish'],
    ...overrides,
  }
}

// Field errors are lists of messages per field, as z.flattenError gives.
const messages = expect.arrayContaining([expect.any(String)])

// Inserted past Mongoose so createdAt and updatedAt keep the given dates.
async function seed(doc: Record<string, unknown>): Promise<Types.ObjectId> {
  const defined = Object.fromEntries(Object.entries(doc).filter(([, value]) => value !== undefined))
  const { insertedId } = await Recipe.collection.insertOne({ createdAt: day(1), updatedAt: day(1), ...defined })
  return insertedId as Types.ObjectId
}

const allRecipes = () => Recipe.collection.find({}).sort({ _id: 1 }).toArray()
const stored = (filter: Record<string, unknown>) => Recipe.collection.findOne(filter)

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongo.getUri('recipe-actions-test')
  for (const [name, value] of Object.entries(cloudinaryEnv)) vi.stubEnv(name, value)
  await (await import('../../lib/dbConnect.ts')).default()
  ;({ Recipe } = await import('../../lib/recipes/model'))
  // autoIndex is off; the unique slug index is what turns a slug race into a duplicate-key error.
  await Recipe.createIndexes()
  ;({ uniqueSlug } = await import('../../lib/recipes/slug'))
  actions = await import('../../app/recipes/actions')
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await mongoose.disconnect()
  await mongo?.stop()
})

beforeEach(async () => {
  await Recipe.deleteMany({})
  auth.mockReset()
  auth.mockResolvedValue(adminSession)
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------- uploads

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0))

// The leading bytes that identify each allowed format.
const MAGIC: Record<string, number[]> = {
  jpeg: [0xff, 0xd8, 0xff, 0xe0],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  webp: [...ascii('RIFF'), 0x24, 0x00, 0x00, 0x00, ...ascii('WEBPVP8 ')],
  avif: [0x00, 0x00, 0x00, 0x1c, ...ascii('ftypavif')],
  heic: [0x00, 0x00, 0x00, 0x18, ...ascii('ftypheic')],
}

function fileOf(header: number[], { size = 1024, type, name }: { size?: number; type: string; name: string }) {
  const bytes = new Uint8Array(size)
  bytes.set(header)
  return new File([bytes], name, { type })
}

const pngFile = (size = 1024) => fileOf(MAGIC.png, { size, type: 'image/png', name: 'photo.png' })

function formWith(file: File | string) {
  const form = new FormData()
  form.set('file', file)
  return form
}

function cloudinaryOk(publicId = 'recipes/abc123') {
  return new Response(JSON.stringify({ public_id: publicId, format: 'png', bytes: 1024 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

// The request the action sent to Cloudinary, read back as multipart form data.
async function sentRequest() {
  expect(fetchMock).toHaveBeenCalledOnce()
  const request = new Request(...(fetchMock.mock.calls[0] as Parameters<typeof fetch>))
  return { url: request.url, method: request.method, form: await request.formData() }
}

describe('every action rejects callers with no session', () => {
  beforeEach(async () => {
    await seed(recipeDoc({ slug: 'beef-stew' }))
    auth.mockResolvedValue(null)
  })

  it('createRecipe throws and writes nothing', async () => {
    const before = await allRecipes()
    await expect(actions.createRecipe(validInput({ name: 'Lamb Stew' }))).rejects.toThrow()
    expect(await allRecipes()).toEqual(before)
  })

  it('createRecipe throws before validating, so invalid input gets no field errors', async () => {
    await expect(actions.createRecipe({})).rejects.toThrow()
  })

  it('uploadRecipeImage throws, uploads nothing and writes nothing', async () => {
    fetchMock.mockImplementation(async () => cloudinaryOk())
    const before = await allRecipes()
    await expect(actions.uploadRecipeImage(formWith(pngFile()))).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await allRecipes()).toEqual(before)
  })
})

describe('updateRecipe rejects callers who are not admins', () => {
  describe.each(unauthorized)('with $label', ({ session }) => {
    beforeEach(async () => {
      await seed(recipeDoc({ slug: 'beef-stew' }))
      auth.mockResolvedValue(session)
    })

    it('throws and leaves the recipe unchanged', async () => {
      const before = await allRecipes()
      const id = String(before[0]._id)
      await expect(
        actions.updateRecipe(id, validInput({ name: 'Hacked', slug: 'hacked' }))
      ).rejects.toThrow()
      expect(await allRecipes()).toEqual(before)
    })

    it('throws before checking the id', async () => {
      await expect(actions.updateRecipe('not-an-id', validInput({ slug: 'x' }))).rejects.toThrow()
    })
  })
})

// ---------------------------------------------------------------- create

describe('createRecipe', () => {
  it('saves a published recipe owned by the signed-in admin and returns its slug', async () => {
    const before = Date.now()
    const result = await actions.createRecipe(validInput({ name: 'Mac & Cheese' }))
    const after = Date.now()

    expect(result).toEqual({ ok: true, slug: 'mac-and-cheese' })
    const saved = await stored({ slug: 'mac-and-cheese' })
    expect(saved).toMatchObject({ name: 'Mac & Cheese', status: 'published' })
    expect(saved!.submittedBy).toBeInstanceOf(Types.ObjectId)
    expect(saved!.submittedBy.equals(actingAdminId)).toBe(true)
    expect(saved!.publishedAt).toBeInstanceOf(Date)
    expect(saved!.publishedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(saved!.publishedAt.getTime()).toBeLessThanOrEqual(after)
  })

  it('stores the parsed input: coerced numbers, normalized tags, blank optionals left out', async () => {
    await actions.createRecipe(
      validInput({ servings: '6', prepTime: '15', tags: ['Dinner', ' dinner ', 'Stew'], notes: '  ', credit: '' })
    )
    const saved = await stored({ slug: 'beef-stew' })
    expect(saved).toMatchObject({ servings: 6, prepTime: 15, tags: ['dinner', 'stew'] })
    expect(saved).not.toHaveProperty('notes')
    expect(saved).not.toHaveProperty('credit')
  })

  it('ignores client-supplied submittedBy, status, slug, _id, publishedAt, createdAt and rejectionReason', async () => {
    const forgedId = new Types.ObjectId('65f000000000000000000000')
    const result = await actions.createRecipe(
      validInput({
        name: 'Pancakes',
        _id: forgedId.toHexString(),
        submittedBy: adminId.toHexString(),
        status: 'rejected',
        rejectionReason: 'forged',
        slug: 'forged-slug',
        publishedAt: '2000-01-01T00:00:00.000Z',
        createdAt: '2000-01-01T00:00:00.000Z',
      })
    )

    expect(result).toEqual({ ok: true, slug: 'pancakes' })
    expect(await stored({ _id: forgedId })).toBeNull()
    expect(await stored({ slug: 'forged-slug' })).toBeNull()
    const saved = await stored({ slug: 'pancakes' })
    expect(saved).toMatchObject({ status: 'published' })
    expect(saved).not.toHaveProperty('rejectionReason')
    expect(saved!.submittedBy.equals(actingAdminId)).toBe(true)
    expect(saved!.publishedAt.getUTCFullYear()).not.toBe(2000)
    expect(saved!.createdAt.getUTCFullYear()).not.toBe(2000)
  })

  it('returns field errors for invalid input and writes nothing', async () => {
    const result = await actions.createRecipe(validInput({ name: '', ingredients: [], servings: 0 }))
    expect(result).toEqual({
      ok: false,
      fieldErrors: expect.objectContaining({ name: messages, ingredients: messages, servings: messages }),
    })
    expect(await allRecipes()).toEqual([])
  })

  it.each([['🍲🍲'], ['!!!']])('returns a name field error for %j, which has nothing to slug, and writes nothing', async (name) => {
    const result = await actions.createRecipe(validInput({ name }))
    expect(result).toEqual({ ok: false, fieldErrors: expect.objectContaining({ name: messages }) })
    expect(await allRecipes()).toEqual([])
  })

  it('gives a second recipe with the same name the slug x-2', async () => {
    expect(await actions.createRecipe(validInput({ name: 'Beef Stew' }))).toEqual({ ok: true, slug: 'beef-stew' })
    expect(await actions.createRecipe(validInput({ name: 'Beef Stew' }))).toEqual({ ok: true, slug: 'beef-stew-2' })
    expect(await Recipe.countDocuments({ name: 'Beef Stew' })).toBe(2)
  })

  it('turns a duplicate-key race on the slug into a slug field error, not a throw', async () => {
    await seed(recipeDoc({ slug: 'beef-stew' }))
    const before = await allRecipes()
    // Another create took the slug between uniqueSlug's check and this insert.
    vi.mocked(uniqueSlug).mockResolvedValueOnce('beef-stew')

    const result = await actions.createRecipe(validInput({ name: 'Beef Stew' }))

    expect(result).toEqual({ ok: false, fieldErrors: expect.objectContaining({ slug: messages }) })
    expect(await allRecipes()).toEqual(before)
  })
})

describe('createRecipe for a signed-in user who is not an admin', () => {
  beforeEach(() => {
    auth.mockResolvedValue(userSession)
  })

  it('saves a pending recipe with no publishedAt, owned by the user', async () => {
    const result = await actions.createRecipe(validInput({ name: 'Mac & Cheese' }))

    expect(result).toEqual({ ok: true, slug: 'mac-and-cheese' })
    const saved = await stored({ slug: 'mac-and-cheese' })
    expect(saved).toMatchObject({ name: 'Mac & Cheese', status: 'pending' })
    expect(saved).not.toHaveProperty('publishedAt')
    expect(saved!.submittedBy.equals(userId)).toBe(true)
  })

  it('ignores a client-supplied status and publishedAt', async () => {
    await actions.createRecipe(validInput({ status: 'published', publishedAt: '2024-01-05T00:00:00.000Z' }))
    const saved = await stored({ slug: 'beef-stew' })
    expect(saved).toMatchObject({ status: 'pending' })
    expect(saved).not.toHaveProperty('publishedAt')
  })
})

describe('the pending cap', () => {
  // `count` pending recipes submitted by `submittedBy`, with distinct slugs.
  async function seedPending(count: number, submittedBy = userId) {
    for (let n = 1; n <= count; n++) await seed(pendingDoc({ slug: `pending-${n}`, submittedBy }))
  }

  it('is 5', () => {
    expect(MAX_PENDING_PER_USER).toBe(5)
  })

  it('lets a user submit their 5th pending recipe', async () => {
    auth.mockResolvedValue(userSession)
    await seedPending(MAX_PENDING_PER_USER - 1)
    expect(await actions.createRecipe(validInput())).toEqual({ ok: true, slug: 'beef-stew' })
  })

  it('refuses a 6th with a form error and writes nothing', async () => {
    auth.mockResolvedValue(userSession)
    await seedPending(MAX_PENDING_PER_USER)
    const before = await allRecipes()

    const result = await actions.createRecipe(validInput())

    expect(result).toEqual({
      ok: false,
      formError: "You have 5 recipes waiting for review. You can submit more once they've been reviewed.",
    })
    expect(await allRecipes()).toEqual(before)
  })

  it('does not apply to admins', async () => {
    await seedPending(MAX_PENDING_PER_USER, actingAdminId)
    expect(await actions.createRecipe(validInput())).toEqual({ ok: true, slug: 'beef-stew' })
  })

  it("counts only the user's own pending recipes, not published, rejected or other users' ones", async () => {
    auth.mockResolvedValue(userSession)
    await seedPending(MAX_PENDING_PER_USER - 1)
    await seed(recipeDoc({ slug: 'published-1', submittedBy: userId }))
    await seed(rejectedDoc({ slug: 'rejected-1', submittedBy: userId }))
    await seed(pendingDoc({ slug: 'someone-elses', submittedBy: adminId }))
    expect(await actions.createRecipe(validInput())).toEqual({ ok: true, slug: 'beef-stew' })
  })

  it('refuses an upload at the cap with the same message, without calling Cloudinary', async () => {
    auth.mockResolvedValue(userSession)
    fetchMock.mockImplementation(async () => cloudinaryOk())
    await seedPending(MAX_PENDING_PER_USER)

    const result = await actions.uploadRecipeImage(formWith(pngFile()))

    expect(result).toEqual({
      ok: false,
      error: "You have 5 recipes waiting for review. You can submit more once they've been reviewed.",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lets a user under the cap upload', async () => {
    auth.mockResolvedValue(userSession)
    fetchMock.mockImplementation(async () => cloudinaryOk())
    await seedPending(MAX_PENDING_PER_USER - 1)
    expect(await actions.uploadRecipeImage(formWith(pngFile()))).toEqual({ ok: true, publicId: 'recipes/abc123' })
  })

  it('does not stop an admin uploading', async () => {
    fetchMock.mockImplementation(async () => cloudinaryOk())
    await seedPending(MAX_PENDING_PER_USER, actingAdminId)
    expect(await actions.uploadRecipeImage(formWith(pngFile()))).toEqual({ ok: true, publicId: 'recipes/abc123' })
  })
})

// ---------------------------------------------------------------- update

describe('updateRecipe', () => {
  const original = recipeDoc({
    name: 'Beef Stew',
    slug: 'beef-stew',
    notes: 'Better the next day.',
    credit: 'Grandma',
    sourceUrl: 'https://example.com/stew',
    imagePublicId: 'recipes/stew',
    publishedAt: day(2),
  })

  it('replaces the input fields and keeps submittedBy, status, publishedAt and createdAt', async () => {
    const id = await seed(original)
    const result = await actions.updateRecipe(
      id.toHexString(),
      validInput({
        name: 'Lamb Stew',
        slug: 'beef-stew',
        description: 'Rich and slow.',
        ingredients: [{ quantity: 1, unit: 'kg', item: 'lamb shoulder' }],
        steps: ['Braise the lamb.'],
        servings: '6',
        prepTime: 30,
        cookTime: 180,
        tags: ['Dinner', 'dinner'],
        notes: 'Use bone-in.',
        credit: 'Uncle Bob',
        sourceUrl: 'https://example.com/lamb',
        imagePublicId: 'recipes/lamb',
      })
    )

    expect(result).toEqual({ ok: true, slug: 'beef-stew' })
    const saved = await stored({ _id: id })
    expect(saved).toMatchObject({
      name: 'Lamb Stew',
      description: 'Rich and slow.',
      ingredients: [{ quantity: 1, unit: 'kg', item: 'lamb shoulder' }],
      steps: ['Braise the lamb.'],
      servings: 6,
      prepTime: 30,
      cookTime: 180,
      tags: ['dinner'],
      notes: 'Use bone-in.',
      credit: 'Uncle Bob',
      sourceUrl: 'https://example.com/lamb',
      imagePublicId: 'recipes/lamb',
      status: 'published',
      publishedAt: day(2),
      createdAt: day(1),
    })
    // Kept as the original author, not replaced by the admin who edited it.
    expect(saved!.submittedBy.equals(adminId)).toBe(true)
  })

  it('clears optional fields left blank or left out', async () => {
    const id = await seed(original)
    const result = await actions.updateRecipe(
      id.toHexString(),
      validInput({ slug: 'beef-stew', notes: '', credit: '   ', imagePublicId: '' })
    )

    expect(result).toEqual({ ok: true, slug: 'beef-stew' })
    const saved = await stored({ _id: id })
    for (const field of ['notes', 'credit', 'sourceUrl', 'imagePublicId']) expect(saved).not.toHaveProperty(field)
  })

  it('changes the slug and returns the new one', async () => {
    const id = await seed(original)
    const result = await actions.updateRecipe(id.toHexString(), validInput({ slug: 'grandmas-stew' }))

    expect(result).toEqual({ ok: true, slug: 'grandmas-stew' })
    expect(await stored({ _id: id })).toMatchObject({ slug: 'grandmas-stew' })
    expect(await stored({ slug: 'beef-stew' })).toBeNull()
  })

  it('accepts keeping its own slug', async () => {
    const id = await seed(original)
    expect(await actions.updateRecipe(id.toHexString(), validInput({ slug: 'beef-stew', name: 'Beef Stew II' }))).toEqual(
      { ok: true, slug: 'beef-stew' }
    )
    expect(await stored({ _id: id })).toMatchObject({ name: 'Beef Stew II' })
  })

  it('returns a slug field error when another recipe holds the slug, and changes nothing', async () => {
    const id = await seed(original)
    await seed(pendingDoc({ name: 'Carrot Soup', slug: 'carrot-soup' }))
    const before = await allRecipes()

    const result = await actions.updateRecipe(id.toHexString(), validInput({ slug: 'carrot-soup', name: 'Renamed' }))

    expect(result).toEqual({ ok: false, fieldErrors: expect.objectContaining({ slug: messages }) })
    expect(await allRecipes()).toEqual(before)
  })

  it.each([['Beef Stew'], ['beef--stew'], ['-beef'], ['beef_stew'], ['']])(
    'rejects the malformed slug %j with a slug field error',
    async (slug) => {
      const id = await seed(original)
      const before = await allRecipes()
      const result = await actions.updateRecipe(id.toHexString(), validInput({ slug }))
      expect(result).toEqual({ ok: false, fieldErrors: expect.objectContaining({ slug: messages }) })
      expect(await allRecipes()).toEqual(before)
    }
  )

  it('rejects input with no slug with a slug field error', async () => {
    const id = await seed(original)
    const result = await actions.updateRecipe(id.toHexString(), validInput())
    expect(result).toEqual({ ok: false, fieldErrors: expect.objectContaining({ slug: messages }) })
  })

  it('returns field errors for invalid input and leaves the recipe unchanged', async () => {
    const id = await seed(original)
    const before = await allRecipes()
    const result = await actions.updateRecipe(id.toHexString(), validInput({ slug: 'beef-stew', name: '', steps: [] }))
    expect(result).toEqual({ ok: false, fieldErrors: expect.objectContaining({ name: messages, steps: messages }) })
    expect(await allRecipes()).toEqual(before)
  })

  it.each([
    ['an unknown id', '65f000000000000000000000'],
    ['a malformed id', 'not-an-id'],
    // Typed as a string, but a client can post any serializable value.
    ['an ObjectId-shaped object', { _bsontype: 'ObjectId' } as unknown as string],
  ])('returns a form error, not field errors, for %s', async (_label, id) => {
    await seed(original)
    const before = await allRecipes()
    const result = await actions.updateRecipe(id, validInput({ slug: 'beef-stew' }))
    expect(result).toEqual({ ok: false, formError: expect.any(String) })
    expect(await allRecipes()).toEqual(before)
  })

  it('keeps a pending recipe pending with no publishedAt, whatever the input claims', async () => {
    const id = await seed(pendingDoc({ name: 'Pending Pasta', slug: 'pending-pasta' }))
    const result = await actions.updateRecipe(
      id.toHexString(),
      validInput({ name: 'Edited Pasta', slug: 'pending-pasta', status: 'published', publishedAt: '2024-01-05T00:00:00.000Z' })
    )

    expect(result).toEqual({ ok: true, slug: 'pending-pasta' })
    const saved = await stored({ _id: id })
    expect(saved).toMatchObject({ name: 'Edited Pasta', status: 'pending' })
    expect(saved).not.toHaveProperty('publishedAt')
  })

  it('ignores client-supplied submittedBy, _id and createdAt', async () => {
    const id = await seed(original)
    const forgedId = new Types.ObjectId('65f000000000000000000000')
    await actions.updateRecipe(
      id.toHexString(),
      validInput({
        slug: 'beef-stew',
        _id: forgedId.toHexString(),
        submittedBy: actingAdminId.toHexString(),
        createdAt: '2000-01-01T00:00:00.000Z',
      })
    )
    const saved = await stored({ _id: id })
    expect(saved!.submittedBy.equals(adminId)).toBe(true)
    expect(saved!.createdAt).toEqual(day(1))
    expect(await stored({ _id: forgedId })).toBeNull()
  })

  it('turns a duplicate-key race on the slug into a slug field error, not a throw', async () => {
    const id = await seed(original)
    // Another recipe takes the new slug after the uniqueness check, just before the save.
    const realSave = Recipe.prototype.save
    vi.spyOn(Recipe.prototype, 'save').mockImplementationOnce(async function (this: any, ...args: any[]) {
      await seed(recipeDoc({ name: 'Other Stew', slug: 'grandmas-stew' }))
      return realSave.apply(this, args as Parameters<typeof realSave>)
    })

    const result = await actions.updateRecipe(id.toHexString(), validInput({ slug: 'grandmas-stew' }))

    expect(result).toEqual({ ok: false, fieldErrors: expect.objectContaining({ slug: messages }) })
    expect(await stored({ _id: id })).toMatchObject({ slug: 'beef-stew', name: 'Beef Stew' })
  })
})

// ---------------------------------------------------------------- upload

describe('uploadRecipeImage', () => {
  const now = new Date('2026-10-23T12:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
    fetchMock.mockImplementation(async () => cloudinaryOk())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('caps uploads at 2 MB', () => {
    expect(MAX_UPLOAD_BYTES).toBe(2 * 1024 * 1024)
  })

  it('rejects a file over 2 MB without calling Cloudinary', async () => {
    const result = await actions.uploadRecipeImage(formWith(pngFile(MAX_UPLOAD_BYTES + 1)))
    expect(result).toEqual({ ok: false, error: expect.any(String) })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uploads a file of exactly 2 MB', async () => {
    const result = await actions.uploadRecipeImage(formWith(pngFile(MAX_UPLOAD_BYTES)))
    expect(result).toEqual({ ok: true, publicId: 'recipes/abc123' })
    const { form } = await sentRequest()
    expect((form.get('file') as File).size).toBe(MAX_UPLOAD_BYTES)
  })

  it.each([
    ['text/plain', MAGIC.png, 'photo.png'],
    ['image/gif', ascii('GIF89a'), 'anim.gif'],
    ['image/svg+xml', ascii('<svg xmlns="http://www.w3.org/2000/svg">'), 'logo.svg'],
    ['', MAGIC.png, 'photo.png'],
  ])('rejects the MIME type %j without calling Cloudinary', async (type, header, name) => {
    const result = await actions.uploadRecipeImage(formWith(fileOf(header, { type, name })))
    expect(result).toEqual({ ok: false, error: expect.any(String) })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a text file named .png and declared image/png, by its magic bytes', async () => {
    const file = new File(['just some text, not an image'], 'notes.png', { type: 'image/png' })
    const result = await actions.uploadRecipeImage(formWith(file))
    expect(result).toEqual({ ok: false, error: expect.any(String) })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a file whose magic bytes are an allowed format other than its declared one', async () => {
    const file = fileOf(MAGIC.jpeg, { type: 'image/png', name: 'photo.png' })
    const result = await actions.uploadRecipeImage(formWith(file))
    expect(result).toEqual({ ok: false, error: expect.any(String) })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an empty file', async () => {
    const result = await actions.uploadRecipeImage(formWith(new File([], 'empty.png', { type: 'image/png' })))
    expect(result).toEqual({ ok: false, error: expect.any(String) })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['no file entry', new FormData()],
    ['a text entry instead of a file', formWith('not a file')],
  ])('rejects form data with %s', async (_label, form) => {
    const result = await actions.uploadRecipeImage(form)
    expect(result).toEqual({ ok: false, error: expect.any(String) })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['jpeg', 'image/jpeg', 'photo.jpg'],
    ['png', 'image/png', 'photo.png'],
    ['webp', 'image/webp', 'photo.webp'],
    ['avif', 'image/avif', 'photo.avif'],
    ['heic', 'image/heic', 'photo.heic'],
  ])('accepts a %s file by its magic bytes', async (format, type, name) => {
    const result = await actions.uploadRecipeImage(formWith(fileOf(MAGIC[format], { type, name })))
    expect(result).toEqual({ ok: true, publicId: 'recipes/abc123' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('POSTs the file to Cloudinary with the api key and the signed upload params', async () => {
    const file = pngFile()
    await actions.uploadRecipeImage(formWith(file))

    const { url, method, form } = await sentRequest()
    expect(url).toBe(CLOUDINARY_UPLOAD_URL)
    expect(method).toBe('POST')
    expect(form.get('api_key')).toBe(cloudinaryEnv.CLOUDINARY_API_KEY)
    expect(form.get('timestamp')).toBe(String(Math.floor(now.getTime() / 1000)))
    expect(form.get('folder')).toBe(UPLOAD_FOLDER)
    expect(form.get('allowed_formats')).toBe(ALLOWED_FORMATS)
    expect(form.get('transformation')).toBe(UPLOAD_TRANSFORMATION)
    expect(form.get('signature')).toMatch(/^[0-9a-f]{40}$/)
    const sent = form.get('file') as File
    expect(sent).toBeInstanceOf(File)
    expect(new Uint8Array(await sent.arrayBuffer())).toEqual(new Uint8Array(await file.arrayBuffer()))
    // The secret signs the request; it is never sent.
    for (const value of form.values()) expect(value).not.toBe(cloudinaryEnv.CLOUDINARY_API_SECRET)
  })

  it('signs exactly the params it sends, with signUploadParams and the api secret', async () => {
    await actions.uploadRecipeImage(formWith(pngFile()))

    const { form } = await sentRequest()
    const signed = {
      folder: String(form.get('folder')),
      timestamp: String(form.get('timestamp')),
      allowed_formats: String(form.get('allowed_formats')),
      transformation: String(form.get('transformation')),
    }
    expect(form.get('signature')).toBe(signUploadParams(signed, cloudinaryEnv.CLOUDINARY_API_SECRET))
  })

  it.each([[400], [401], [500]])('returns { ok: false } when Cloudinary answers %i', async (status) => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { message: 'Invalid Signature. String to sign - folder=recipes' } }), {
          status,
          headers: { 'content-type': 'application/json' },
        })
    )
    const result = await actions.uploadRecipeImage(formWith(pngFile()))
    expect(result).toEqual({ ok: false, error: expect.any(String) })
  })

  it('sends the Cloudinary request with an abort signal, so a stalled upload is cut off', async () => {
    await actions.uploadRecipeImage(formWith(pngFile()))
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('returns { ok: false, error } when the Cloudinary request times out', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
    const result = await actions.uploadRecipeImage(formWith(pngFile()))
    expect(result).toEqual({ ok: false, error: expect.any(String) })
    expect(Object.keys(result).sort()).toEqual(['error', 'ok'])
  })

  it('throws on any other fetch failure, failing fast', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    await expect(actions.uploadRecipeImage(formWith(pngFile()))).rejects.toThrow(TypeError)
  })

  it('never returns the api secret or the signature, on success or failure', async () => {
    const success = await actions.uploadRecipeImage(formWith(pngFile()))
    const { form } = await sentRequest()
    const signature = String(form.get('signature'))

    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { message: `Invalid Signature ${signature}.` } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
    )
    const failure = await actions.uploadRecipeImage(formWith(pngFile()))

    for (const result of [success, failure]) {
      const json = JSON.stringify(result)
      expect(json).not.toContain(cloudinaryEnv.CLOUDINARY_API_SECRET)
      expect(json).not.toContain(signature)
    }
    expect(Object.keys(success).sort()).toEqual(['ok', 'publicId'])
    expect(Object.keys(failure).sort()).toEqual(['error', 'ok'])
  })
})
