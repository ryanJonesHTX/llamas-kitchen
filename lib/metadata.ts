import type { Metadata } from 'next'
import { requireEnv } from './env'

// Site-wide metadata and link-preview tags. Next merges metadata shallowly: a
// page that sets openGraph or twitter replaces the layout's whole object, so
// it starts from these and restates what it keeps.

export const SITE_NAME = "Llama's Kitchen"

const SITE_DESCRIPTION =
  'A collection of recipes acquired from friends, family and discovered as we go along.'

// Link-preview images are 1200x630, the size Open Graph and Twitter cards expect.
const PREVIEW_IMAGE_SIZE = { width: 1200, height: 630 }

type PreviewImage = { url: string; width: number; height: number; alt: string }

export function previewImage(url: string, alt: string): PreviewImage {
  return { url, ...PREVIEW_IMAGE_SIZE, alt }
}

// The root layout's metadata. AUTH_URL is the site's origin, so relative
// preview URLs become absolute.
export function siteMetadata(): Metadata {
  return {
    metadataBase: new URL(requireEnv('AUTH_URL')),
    title: { template: `%s | ${SITE_NAME}`, default: SITE_NAME },
    description: SITE_DESCRIPTION,
    icons: { icon: '/images/favicon.ico' },
    openGraph: { siteName: SITE_NAME, type: 'website', images: [previewImage('/preview-image', SITE_NAME)] },
    twitter: { card: 'summary_large_image' },
  }
}
