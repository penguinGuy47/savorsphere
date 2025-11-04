/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'export',  // Static SPA mode (like CRA, no server needed)
    distDir: 'build',  // Matches CRA's build folder
    trailingSlash: true,
    images: { unoptimized: true },  // For static export
  };
  
  module.exports = nextConfig;