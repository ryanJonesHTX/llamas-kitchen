module.exports = {
  poweredByHeader: false,
  // next (16.4.3 included) has no exports map, so Node's ESM resolver can't
  // resolve next-auth's extensionless `next/server` import in Pages server code.
  transpilePackages: ['next-auth'],
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