import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The fake recipe site that tests/e2e/fake-recipe-site.ts serves inside the
// `next start` process. The importer reaches it at http://recipes.e2e.test/<page>.
export const FAKE_RECIPE_HOST = 'recipes.e2e.test'

// What the fake DNS answers for FAKE_RECIPE_HOST: public, so the importer's
// address check passes, and never actually connected to.
export const FAKE_RECIPE_ADDRESS = '93.184.215.14'

export const recipeSiteUrl = (page: string) => `http://${FAKE_RECIPE_HOST}/${page}`

// While this file is missing, the fake site holds requests for /slow. Shared
// by the server process and the test workers, so it lives in a fixed place.
export const SLOW_PAGE_RELEASE = join(tmpdir(), 'llamas-kitchen-e2e-recipe-site-slow.release')

export function releaseSlowPage(): void {
  writeFileSync(SLOW_PAGE_RELEASE, '')
}

export function resetRecipeSite(): void {
  rmSync(SLOW_PAGE_RELEASE, { force: true })
}
