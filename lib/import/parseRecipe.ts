// Turns a fetched page's schema.org Recipe (JSON-LD) into prefilled recipe-form
// values and the photo URL to import. Pure: no network, no DB. The person
// reviews the values in the form, whose validation reports over-long fields.
import type { RecipeFormValues } from '../../components/RecipeForm'
import { MAX_RECIPE_INGREDIENTS, MAX_RECIPE_STEPS, MAX_RECIPE_TAGS } from '../constants'
import { normalizeTag } from '../recipes/input'

type JsonObject = Record<string, unknown>

// The form's input type leaves its preprocessed fields unknown; the parser always gives strings.
type ImportedFormValues = RecipeFormValues &
  Record<'servings' | 'prepTime' | 'cookTime' | 'notes' | 'credit' | 'sourceUrl', string>

export type ParsedRecipePage = { values: ImportedFormValues; imageUrl: string | null }

const LD_JSON_TYPE = /(?:^|\s)type\s*=\s*(["'])\s*application\/ld\+json\s*\1/i
const ENTITY = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(amp|lt|gt|quot|apos|nbsp));/g
const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
// How deep the Recipe search and instruction flattening go; deeper nesting is ignored.
const MAX_NESTING_DEPTH = 32
// ISO 8601 duration: days, hours, minutes, whole seconds.
const DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// A JSON-LD property as a list: missing is empty, a single value is one entry.
function asList(value: unknown): unknown[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

// The contents of every ld+json script, parsed; blocks that aren't valid JSON are
// skipped. An indexOf scan rather than a regex keeps it linear on hostile pages.
// Only ASCII is lowercased, so indexes in the copy are indexes in html.
function jsonLdBlocks(html: string): unknown[] {
  const lower = html.replace(/[A-Z]+/g, (letters) => letters.toLowerCase())
  const blocks: unknown[] = []
  let from = 0
  for (;;) {
    const open = lower.indexOf('<script', from)
    if (open === -1) break
    const attributesStart = open + '<script'.length
    from = attributesStart
    if (/\w/.test(lower.charAt(attributesStart))) continue
    const tagEnd = lower.indexOf('>', attributesStart)
    if (tagEnd === -1) break
    const close = lower.indexOf('</script', tagEnd)
    if (close === -1) break
    from = close + '</script'.length
    if (!LD_JSON_TYPE.test(html.slice(attributesStart, tagEnd))) continue
    try {
      blocks.push(JSON.parse(html.slice(tagEnd + 1, close)))
    } catch {
      // Malformed JSON-LD is common; another block may still hold the Recipe.
    }
  }
  return blocks
}

// The nodes a block lists: top-level objects and arrays, @graph arrays, and
// one level into a node's mainEntity. Other nested properties aren't searched.
function blockNodes(value: unknown, depth = 0): JsonObject[] {
  if (depth > MAX_NESTING_DEPTH) return []
  if (Array.isArray(value)) return value.flatMap((entry) => blockNodes(entry, depth + 1))
  if (!isObject(value)) return []
  return [value, ...blockNodes(value['@graph'], depth + 1), ...asList(value.mainEntity).filter(isObject)]
}

function isRecipe(node: JsonObject): boolean {
  return asList(node['@type']).includes('Recipe')
}

// Tags are stripped (each to a space) before entities are decoded once, so
// encoded markup stays literal text. Whitespace runs, U+00A0 included, collapse.
function cleanText(text: string): string {
  return text
    .replace(/<[^<>]*>/g, ' ')
    .replace(ENTITY, (entity, decimal?: string, hex?: string, name?: string) => {
      if (name) return NAMED_ENTITIES[name]
      const codePoint = decimal ? Number(decimal) : parseInt(hex!, 16)
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity
    })
    .replace(/\s+/g, ' ')
    .trim()
}

// A string property, cleaned; '' when it isn't a string.
function textOf(value: unknown): string {
  return typeof value === 'string' ? cleanText(value) : ''
}

// Ingredient and step rows are kept to one past the limit: enough for the form to
// report "too many", without sending a hostile page's huge list to the browser.
function ingredientRows(recipe: JsonObject): RecipeFormValues['ingredients'] {
  const lines = asList(recipe.recipeIngredient ?? recipe.ingredients)
    .map(textOf)
    .filter(Boolean)
    .slice(0, MAX_RECIPE_INGREDIENTS + 1)
  return lines.length ? lines.map((line) => ({ line })) : [{ line: '' }]
}

// Instructions in order: strings (one step per line), HowToSteps (text, else
// name), HowToSections (their steps; the section name is dropped), and arrays of these.
function stepTexts(value: unknown, depth = 0): string[] {
  if (depth > MAX_NESTING_DEPTH) return []
  if (typeof value === 'string') return value.split(/\r?\n/).map(cleanText)
  if (Array.isArray(value)) return value.flatMap((entry) => stepTexts(entry, depth + 1))
  if (!isObject(value)) return []
  if (value.itemListElement !== undefined) return stepTexts(value.itemListElement, depth + 1)
  return [textOf(typeof value.text === 'string' ? value.text : value.name)]
}

function stepRows(recipe: JsonObject): RecipeFormValues['steps'] {
  const texts = stepTexts(recipe.recipeInstructions).filter(Boolean).slice(0, MAX_RECIPE_STEPS + 1)
  return texts.length ? texts.map((text) => ({ text })) : [{ text: '' }]
}

// The first whole number in the first recipeYield entry that has one: "Serves 6-8" is '6'.
function servingsOf(recipe: JsonObject): string {
  for (const entry of asList(recipe.recipeYield)) {
    const text = typeof entry === 'number' ? String(entry) : textOf(entry)
    const number = text.match(/\d+/)
    if (number) return number[0]
  }
  return ''
}

// An ISO 8601 duration in whole minutes, rounded to the nearest; '' if it can't be read.
function minutesOf(value: unknown): string {
  const match = textOf(value).match(DURATION)
  if (!match || match.slice(1).every((part) => part === undefined)) return ''
  const [days, hours, minutes, seconds] = match.slice(1).map((part) => Number(part ?? 0))
  return String(Math.round(days * 1440 + hours * 60 + minutes + seconds / 60))
}

// recipeCategory then recipeCuisine, comma-separated strings split, normalized,
// de-duplicated in first-seen order, capped at MAX_RECIPE_TAGS.
function tagsOf(recipe: JsonObject): string[] {
  const tags = [...asList(recipe.recipeCategory), ...asList(recipe.recipeCuisine)]
    .flatMap((entry) => textOf(entry).split(','))
    .map(normalizeTag)
    .filter(Boolean)
  return [...new Set(tags)].slice(0, MAX_RECIPE_TAGS)
}

// Author names joined with ", ". An entry is a name, a node with a name, or an
// { @id } reference to a node in the same block; unnamed entries are skipped.
function creditOf(recipe: JsonObject, nodes: JsonObject[]): string {
  const namesById = new Map<string, unknown>()
  for (const node of nodes) {
    const id = node['@id']
    if (typeof id === 'string' && node.name !== undefined && !namesById.has(id)) namesById.set(id, node.name)
  }
  return asList(recipe.author)
    .map((author) => {
      if (!isObject(author)) return textOf(author)
      if (author.name !== undefined) return textOf(author.name)
      const id = author['@id']
      return typeof id === 'string' ? textOf(namesById.get(id)) : ''
    })
    .filter(Boolean)
    .join(', ')
}

// The first image (a URL, or an ImageObject's url, else contentUrl) that is
// http or https once resolved against the page.
function imageUrlOf(recipe: JsonObject, pageUrl: string): string | null {
  for (const image of asList(recipe.image)) {
    const text = textOf(isObject(image) ? (image.url ?? image.contentUrl) : image)
    const url = text ? URL.parse(text, pageUrl) : null
    if (url && (url.protocol === 'http:' || url.protocol === 'https:')) return url.href
  }
  return null
}

function formValues(recipe: JsonObject, nodes: JsonObject[], pageUrl: string): ImportedFormValues {
  return {
    name: textOf(recipe.name),
    description: textOf(recipe.description),
    ingredients: ingredientRows(recipe),
    steps: stepRows(recipe),
    tags: tagsOf(recipe),
    servings: servingsOf(recipe),
    prepTime: minutesOf(recipe.prepTime),
    cookTime: minutesOf(recipe.cookTime),
    notes: '',
    credit: creditOf(recipe, nodes),
    sourceUrl: pageUrl,
  }
}

// The page's first schema.org Recipe as form values, or null if it has none.
// pageUrl is the URL the page was finally fetched from.
export function parseRecipePage(html: string, pageUrl: string): ParsedRecipePage | null {
  for (const block of jsonLdBlocks(html)) {
    const nodes = blockNodes(block)
    const recipe = nodes.find(isRecipe)
    if (recipe) return { values: formValues(recipe, nodes, pageUrl), imageUrl: imageUrlOf(recipe, pageUrl) }
  }
  return null
}
