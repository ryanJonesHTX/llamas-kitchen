// Leading bytes of each image type uploads accept; null matches any byte.
type Signature = (number | null)[]

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0))
// ISO-BMFF: a 4-byte box size, then 'ftyp' and the major brand.
const ftyp = (brand: string): Signature => [null, null, null, null, ...ascii('ftyp'), ...ascii(brand)]

// A Map, so a declared type like 'constructor' can't hit an Object prototype key.
const SIGNATURES = new Map<string, Signature[]>([
  ['image/jpeg', [[0xff, 0xd8, 0xff]]],
  ['image/png', [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]],
  ['image/webp', [[...ascii('RIFF'), null, null, null, null, ...ascii('WEBP')]]],
  ['image/avif', [ftyp('avif'), ftyp('avis')]],
  // iPhones write heix as well as heic.
  ['image/heic', [ftyp('heic'), ftyp('heix')]],
])

// Enough leading bytes to check any signature.
export const IMAGE_HEADER_BYTES = 12

// True when mimeType is an accepted image type and the file's leading bytes match it.
export function matchesImageType(header: Uint8Array, mimeType: string): boolean {
  const signatures = SIGNATURES.get(mimeType) ?? []
  return signatures.some((signature) => signature.every((byte, i) => byte === null || header[i] === byte))
}
