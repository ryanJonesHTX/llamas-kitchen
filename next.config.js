module.exports = {
  // next (16.4.3 included) has no exports map, so Node's ESM resolver can't
  // resolve next-auth's extensionless `next/server` import in Pages server code.
  transpilePackages: ['next-auth'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
}