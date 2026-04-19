/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      // /docs serve la documentazione tecnica HTML generata da docs/*.md
      { source: "/docs", destination: "/docs/index.html" },
    ];
  },
};

export default nextConfig;
