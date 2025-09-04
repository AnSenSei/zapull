import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    // Keep existing domains for R2 buckets, plus add Google profile image hosts via remotePatterns.
    domains: [
      "storage.googleapis.com", 
      "picsum.photos",
      // Production R2 buckets
      "avator.zapull.fun",
      "achievement.zapull.fun",
      "pack.zapull.fun",
      "card.zapull.fun",
      "draw.zapull.fun",  // Added draw bucket for GIF animations
      // Development R2 buckets (-dev suffix)
      "avator-dev.zapull.fun",
      "achievement-dev.zapull.fun",
      "pack-dev.zapull.fun",
      "card-dev.zapull.fun"
    ],
    remotePatterns: [
      // Allow Google profile images from all lh*.googleusercontent.com hosts
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
        pathname: '/**',
      },
    ],
    // Disable Next.js image optimization globally since R2 Image Polish handles WebP conversion
    // Google avatars will be handled selectively at component level
    unoptimized: true
  },
  // 为test环境启用静态导出
  output: process.env.NODE_ENV === 'test' ? 'export' : process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  trailingSlash: process.env.NODE_ENV === 'test' ? true : false,
  // 为静态导出配置基础路径
  basePath: process.env.NODE_ENV === 'test' ? '' : '',
  assetPrefix: process.env.NODE_ENV === 'test' ? '' : ''
};

export default nextConfig;
