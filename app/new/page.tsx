import type { Metadata } from 'next'
import RecipeForm from '../../components/RecipeForm'
import SiteHeader from '../../components/SiteHeader'
import { requireAdminPage } from '../../lib/adminGuard'
import { publishedSearchOptions } from '../../lib/recipes/queries'

export const metadata: Metadata = { title: 'Llamas Kitchen - Add Recipe' }

export default async function NewRecipePage() {
  await requireAdminPage('/new')
  return (
    <>
      <SiteHeader searchOptions={await publishedSearchOptions()} />
      <RecipeForm />
    </>
  )
}
