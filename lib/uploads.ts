// Cloudinary can't enforce a size limit on direct uploads, so the form checks it.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export const UPLOAD_FOLDER = 'recipes'
export const ALLOWED_FORMATS = 'jpg,jpeg,png,webp,avif,heic'
// Incoming transformation: shrink anything larger than 2000x2000 on upload.
export const UPLOAD_TRANSFORMATION = 'c_limit,w_2000,h_2000'
