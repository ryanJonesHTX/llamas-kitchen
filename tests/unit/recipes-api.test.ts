import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

// Calls the Pages Router API handlers directly with minimal fake req/res
// objects against an in-memory MongoDB on a random port.

type Handler = (req: FakeRequest, res: FakeResponse) => Promise<unknown>

type FakeRequest = {
  method: string
  query: Record<string, string>
  body?: unknown
}

type FakeResponse = {
  statusCode: number | undefined
  body: any
  headers: Record<string, string>
  status(code: number): FakeResponse
  json(body: unknown): FakeResponse
  setHeader(name: string, value: string | string[]): FakeResponse
  end(): FakeResponse
}

function fakeResponse(): FakeResponse {
  const res: FakeResponse = {
    statusCode: undefined,
    body: undefined,
    headers: {},
    status(code) {
      res.statusCode = code
      return res
    },
    json(body) {
      // Round-trip like a real HTTP response so Mongoose docs become plain JSON.
      res.body = JSON.parse(JSON.stringify(body))
      return res
    },
    setHeader(name, value) {
      res.headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value
      return res
    },
    end() {
      return res
    },
  }
  return res
}

let mongo: MongoMemoryServer
let collectionHandler: Handler
let itemHandler: Handler
let Recipe: mongoose.Model<any>

async function call(handler: Handler, req: Partial<FakeRequest> & { method: string }) {
  const res = fakeResponse()
  await handler({ query: {}, ...req }, res)
  return res
}

const validRecipe = {
  name: 'Pancakes',
  description: 'Fluffy breakfast pancakes',
  directions: 'Mix everything and fry.',
  ingredients: [
    { id: 0, ingredient: 'flour' },
    { id: 1, ingredient: 'milk' },
  ],
  prepTime: 10,
  cookTime: 15,
  photo: 'https://res.cloudinary.com/demo/image/upload/pancakes.jpg',
  cloudinaryId: 'pancakes',
  category: 'Dessert',
  submittedBy: 'Llama',
  notes: 'Serve warm.',
}

const missingId = '65f000000000000000000000'

async function seedRecipe() {
  const doc = await Recipe.create(validRecipe)
  return String(doc._id)
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongo.getUri('recipes-api-test')
  await (await import('../../lib/dbConnect.js')).default()
  collectionHandler = (await import('../../pages/api/recipes/index.js')).default
  itemHandler = (await import('../../pages/api/recipes/[id].js')).default
  Recipe = (await import('../../models/Recipe.js')).default
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo?.stop()
})

beforeEach(async () => {
  await Recipe.deleteMany({})
})

describe('/api/recipes', () => {
  it('GET returns 200 with all recipes', async () => {
    await seedRecipe()
    const res = await call(collectionHandler, { method: 'GET' })
    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].name).toBe('Pancakes')
  })

  it('POST with a valid recipe returns 201 and saves it', async () => {
    const res = await call(collectionHandler, { method: 'POST', body: validRecipe })
    expect(res.statusCode).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toMatchObject(validRecipe)
    expect(await Recipe.countDocuments()).toBe(1)
  })

  it('POST coerces number-input strings before saving', async () => {
    const res = await call(collectionHandler, {
      method: 'POST',
      body: { ...validRecipe, prepTime: '30', cookTime: '45' },
    })
    expect(res.statusCode).toBe(201)
    const saved = await Recipe.findById(res.body.data._id).lean<any>()
    expect(saved.prepTime).toBe(30)
    expect(saved.cookTime).toBe(45)
  })

  it('POST with an invalid body returns 422 with field errors and saves nothing', async () => {
    const { name: _name, ...noName } = validRecipe
    const res = await call(collectionHandler, {
      method: 'POST',
      body: { ...noName, ingredients: [] },
    })
    expect(res.statusCode).toBe(422)
    expect(res.body.success).toBe(false)
    expect(res.body.errors).toHaveProperty('name')
    expect(res.body.errors).toHaveProperty('ingredients')
    expect(await Recipe.countDocuments()).toBe(0)
  })

  it('POST ignores _id, createdAt and unknown keys in the body', async () => {
    const res = await call(collectionHandler, {
      method: 'POST',
      body: {
        ...validRecipe,
        _id: missingId,
        createdAt: '2000-01-01T00:00:00.000Z',
        isAdmin: true,
      },
    })
    expect(res.statusCode).toBe(201)
    expect(res.body.data._id).not.toBe(missingId)
    expect(await Recipe.findById(missingId)).toBeNull()
    const saved = await Recipe.findById(res.body.data._id).lean<any>()
    expect(new Date(saved.createdAt).getUTCFullYear()).not.toBe(2000)
    expect(saved).not.toHaveProperty('isAdmin')
  })

  it.each(['PUT', 'DELETE', 'PATCH'])(
    '%s returns 405 with Allow: GET, POST',
    async (method) => {
      const res = await call(collectionHandler, { method, body: validRecipe })
      expect(res.statusCode).toBe(405)
      expect(res.headers.allow).toBe('GET, POST')
      expect(await Recipe.countDocuments()).toBe(0)
    },
  )
})

describe('/api/recipes/[id]', () => {
  it('GET returns 200 with the recipe', async () => {
    const id = await seedRecipe()
    const res = await call(itemHandler, { method: 'GET', query: { id } })
    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toMatchObject({ _id: id, ...validRecipe })
  })

  it.each(['GET', 'PUT', 'DELETE'])(
    '%s returns 404 for a well-formed id with no recipe',
    async (method) => {
      const res = await call(itemHandler, { method, query: { id: missingId }, body: validRecipe })
      expect(res.statusCode).toBe(404)
      expect(res.body).toEqual({ success: false })
    },
  )

  it.each(['GET', 'PUT', 'DELETE'])(
    '%s returns 404 for the malformed id "not-an-id"',
    async (method) => {
      const res = await call(itemHandler, { method, query: { id: 'not-an-id' }, body: validRecipe })
      expect(res.statusCode).toBe(404)
      expect(res.body).toEqual({ success: false })
    },
  )

  it('PUT with a valid body returns 200 with the updated recipe', async () => {
    const id = await seedRecipe()
    const res = await call(itemHandler, {
      method: 'PUT',
      query: { id },
      body: { ...validRecipe, name: 'Waffles', prepTime: '20' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toMatchObject({ _id: id, name: 'Waffles', prepTime: 20 })
    const saved = await Recipe.findById(id).lean<any>()
    expect(saved.name).toBe('Waffles')
    expect(saved.prepTime).toBe(20)
  })

  it('PUT with an invalid body returns 422 with field errors and leaves the recipe unchanged', async () => {
    const id = await seedRecipe()
    const res = await call(itemHandler, {
      method: 'PUT',
      query: { id },
      body: { ...validRecipe, name: '', cookTime: -1 },
    })
    expect(res.statusCode).toBe(422)
    expect(res.body.success).toBe(false)
    expect(res.body.errors).toHaveProperty('name')
    expect(res.body.errors).toHaveProperty('cookTime')
    const saved = await Recipe.findById(id).lean<any>()
    expect(saved.name).toBe('Pancakes')
    expect(saved.cookTime).toBe(15)
  })

  it('PUT replaces editable fields, clearing optional fields left out of the body', async () => {
    const id = await seedRecipe()
    const { notes: _notes, submittedBy: _submittedBy, ...withoutOptional } = validRecipe
    const res = await call(itemHandler, { method: 'PUT', query: { id }, body: withoutOptional })
    expect(res.statusCode).toBe(200)
    const saved = await Recipe.findById(id).lean<any>()
    expect(saved).not.toHaveProperty('notes')
    expect(saved).not.toHaveProperty('submittedBy')
  })

  it('PUT ignores _id, createdAt and unknown keys in the body', async () => {
    const id = await seedRecipe()
    const before = await Recipe.findById(id).lean<any>()
    const res = await call(itemHandler, {
      method: 'PUT',
      query: { id },
      body: {
        ...validRecipe,
        _id: missingId,
        createdAt: '2000-01-01T00:00:00.000Z',
        isAdmin: true,
      },
    })
    expect(res.statusCode).toBe(200)
    expect(await Recipe.findById(missingId)).toBeNull()
    const saved = await Recipe.findById(id).lean<any>()
    expect(saved.createdAt).toEqual(before.createdAt)
    expect(saved).not.toHaveProperty('isAdmin')
  })

  it('DELETE returns 200 with empty data and removes the recipe', async () => {
    const id = await seedRecipe()
    const res = await call(itemHandler, { method: 'DELETE', query: { id } })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ success: true, data: {} })
    expect(await Recipe.findById(id)).toBeNull()
  })

  it.each(['POST', 'PATCH'])(
    '%s returns 405 with Allow: GET, PUT, DELETE',
    async (method) => {
      const id = await seedRecipe()
      const res = await call(itemHandler, { method, query: { id }, body: validRecipe })
      expect(res.statusCode).toBe(405)
      expect(res.headers.allow).toBe('GET, PUT, DELETE')
    },
  )
})
