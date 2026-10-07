import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  async redirects() {
    return [{ source: '/dashboard', destination: '/sky', permanent: false }];
  },
};

export default nextConfig;
