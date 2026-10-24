import type { Metadata } from 'next'
import RecipeForm from '../../components/RecipeForm'
import { requireAdminPage } from '../../lib/adminGuard'

export const metadata: Metadata = { title: 'Llamas Kitchen - Add Recipe' }

export default async function NewRecipePage() {
  await requireAdminPage('/new')
  return <RecipeForm />
}
