// The form checks it for UX; uploadRecipeImage enforces it on the server.
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
export const UPLOAD_TOO_LARGE_MESSAGE = `Images must be ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB or smaller.`

export const UPLOAD_FOLDER = 'recipes'
// A stored imagePublicId: one segment inside UPLOAD_FOLDER, as uploads produce.
export const IMAGE_PUBLIC_ID_PATTERN = new RegExp(`^${UPLOAD_FOLDER}/[A-Za-z0-9_-]+$`)
export const ALLOWED_FORMATS = 'jpg,jpeg,png,webp,avif,heic'
// Incoming transformation: shrink anything larger than 2000x2000 on upload.
export const UPLOAD_TRANSFORMATION = 'c_limit,w_2000,h_2000'
