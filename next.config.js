/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Increase the body size limit for image uploads
  experimental: {
    largePageDataBytes: 10 * 1024 * 1024, // 10MB
  },
}

module.exports = nextConfig
