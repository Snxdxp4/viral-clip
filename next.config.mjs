/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow YouTube thumbnails
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.ytimg.com' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
    ],
  },
  // Increase body parser limit for API routes
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
