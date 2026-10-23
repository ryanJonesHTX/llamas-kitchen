module.exports = {
  // Next 14 has no exports map, so Node can't resolve next/server from
  // next-auth in Pages server code. Revisit after the Next 16 upgrade.
  transpilePackages: ['next-auth'],
  // Next 14 only runs instrumentation.ts (the startup env check) behind this flag.
  experimental: {
    instrumentationHook: true,
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