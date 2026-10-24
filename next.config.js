module.exports = {
  poweredByHeader: false,
  // Type-check only shipped code so the build fits in the droplet's memory; `npm run typecheck` checks everything.
  typescript: { tsconfigPath: 'tsconfig.build.json' },
  experimental: {
    // A 2 MB image plus multipart overhead; Nginx client_max_body_size must be at least 3m.
    serverActions: { bodySizeLimit: '2.5mb' },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
}