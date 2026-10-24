import { requireEnv } from '../../../lib/env'
import { requireAdmin } from '../../../lib/requireAdmin'
import { signUploadParams } from '../../../lib/uploadSignature'
import {
  ALLOWED_FORMATS,
  UPLOAD_FOLDER,
  UPLOAD_TRANSFORMATION,
} from '../../../lib/uploads'

// Signs the params for a direct browser upload to Cloudinary. Admin-only.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ success: false })
  }

  if (!(await requireAdmin(req, res))) return

  const cloudName = requireEnv('CLOUDINARY_CLOUD_NAME')
  const apiKey = requireEnv('CLOUDINARY_API_KEY')
  const apiSecret = requireEnv('CLOUDINARY_API_SECRET')

  const timestamp = Math.floor(Date.now() / 1000)
  const signature = signUploadParams(
    {
      allowed_formats: ALLOWED_FORMATS,
      folder: UPLOAD_FOLDER,
      timestamp,
      transformation: UPLOAD_TRANSFORMATION,
    },
    apiSecret
  )

  res.status(200).json({
    cloudName,
    apiKey,
    timestamp,
    signature,
    folder: UPLOAD_FOLDER,
    allowedFormats: ALLOWED_FORMATS,
    transformation: UPLOAD_TRANSFORMATION,
  })
}
