import { createHash } from 'node:crypto'

// Upload fields Cloudinary never includes in the signature.
const UNSIGNED_PARAMS = new Set(['file', 'cloud_name', 'resource_type', 'api_key'])

// Cloudinary's signature for uploads and destroys
// (https://cloudinary.com/documentation/authentication_signatures): signed
// params sorted by name as name=value joined with &, the API secret appended
// with no separator, then SHA-1 (the SDK default) as hex.
export function signUploadParams(
  params: Record<string, string | number>,
  apiSecret: string
): string {
  const toSign = Object.keys(params)
    .filter((name) => !UNSIGNED_PARAMS.has(name))
    .sort()
    .map((name) => `${name}=${params[name]}`)
    .join('&')
  return createHash('sha1').update(toSign + apiSecret).digest('hex')
}
