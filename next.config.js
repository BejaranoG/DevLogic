/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",

  // Compress responses (gzip)
  compress: true,

  // Remove X-Powered-By header
  poweredByHeader: false,

  // Tree-shake heavy packages
  experimental: {
    optimizePackageImports: ["recharts", "xlsx", "decimal.js", "lucide-react"],
  },

  // Reduce source maps in production
  productionBrowserSourceMaps: false,
};

module.exports = nextConfig;
