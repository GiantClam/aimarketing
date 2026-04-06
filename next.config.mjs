/** @type {import('next').NextConfig} */
const isVercelBuild = process.env.VERCEL === "1" || process.env.VERCEL === "true"

const nextConfig = {
  // Vercel expects Next build manifests under ".next" unless explicitly configured otherwise.
  distDir:
    process.env.NEXT_DIST_DIR ||
    (isVercelBuild
      ? ".next"
      : process.env.NODE_ENV === "production"
        ? ".next-build"
        : ".next"),
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // 增加 API 路由的超时时间
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

export default nextConfig
