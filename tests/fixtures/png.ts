// Reads a PNG's pixel size from its IHDR chunk, which the format requires to
// come first, right after the 8-byte signature. Throws if the bytes aren't a PNG.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24 || !PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) {
    throw new Error('Not a PNG: missing the PNG signature')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunkType = String.fromCharCode(...bytes.slice(12, 16))
  if (chunkType !== 'IHDR') throw new Error(`Not a PNG: first chunk is ${chunkType}, not IHDR`)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}
