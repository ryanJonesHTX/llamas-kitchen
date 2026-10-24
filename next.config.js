// /_next/image fetches only from this app's Cloudinary cloud. Next loads .env*
// files before this file, so a Ploi .env or .env.local is enough.
const cloud = process.env.CLOUDINARY_CLOUD_NAME
if (!cloud) throw new Error('CLOUDINARY_CLOUD_NAME is not set')

module.exports = {
  poweredByHeader: false,
  // Type-check only shipped code so the build fits in the droplet's memory; `npm run typecheck` checks everything.
  typescript: { tsconfigPath: 'tsconfig.build.json' },
  experimental: {
    // A 2 MB image plus multipart overhead; Nginx client_max_body_size must be at least 3m.
    serverActions: { bodySizeLimit: '2.5mb' },
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com', pathname: `/${cloud}/image/upload/**` }],
  },
}
