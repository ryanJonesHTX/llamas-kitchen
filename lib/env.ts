// Env vars the server refuses to start without (checked in instrumentation.ts).
// ADMIN_EMAILS is optional: empty means no one becomes admin on sign-up.
export const REQUIRED_ENV = [
  'MONGODB_URI',
  'AUTH_SECRET',
  'AUTH_URL',
  'AUTH_GITHUB_ID',
  'AUTH_GITHUB_SECRET',
  'AUTH_RESEND_KEY',
  'EMAIL_FROM',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
] as const

// Required names that are unset or empty.
export function missingEnv(
  env: Record<string, string | undefined>
): string[] {
  return REQUIRED_ENV.filter((name) => !env[name])
}
