// Pure pieces of the image folder migration. No network or database access.
import { UPLOAD_FOLDER } from '../../lib/uploads.ts'

const SEGMENT = /^[A-Za-z0-9_-]+$/

// An old public ID's last path segment, which the copy keeps as its name.
function lastSegment(oldId: string): string {
  const segment = oldId.slice(oldId.lastIndexOf('/') + 1)
  if (!SEGMENT.test(segment)) throw new Error(`Can't make a public ID from ${JSON.stringify(oldId)}`)
  return segment
}

// Where the copy of `oldId` lands: recipe-images/abc becomes recipes/abc.
export function targetPublicId(oldId: string): string {
  return `${UPLOAD_FOLDER}/${lastSegment(oldId)}`
}

// The original asset, untransformed, for Cloudinary to fetch and copy.
export function originalUrl(cloudName: string, oldId: string): string {
  return `https://res.cloudinary.com/${cloudName}/image/upload/${oldId}`
}

// Signed upload params for the copy, with no transformation. The account uses
// fixed folder mode, where folder is prepended to public_id, as in
// uploadRecipeImage. With overwrite off, Cloudinary returns an existing asset
// unchanged, so a re-run (or the other database's run) copies nothing twice.
export function copyParams(oldId: string, timestamp: number) {
  return { folder: UPLOAD_FOLDER, public_id: lastSegment(oldId), overwrite: 'false', timestamp }
}
