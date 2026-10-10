/** @type {import('next').NextConfig} */

// GitHub Pages serves a STATIC mirror of the two pages, under a repo subpath,
// with no server. Vercel serves the full app including the API routes. One
// config, two targets, so neither is a fork of the other.
const isPages = process.env.GITHUB_PAGES === 'true';

const nextConfig = {
  ...(isPages
    ? { output: 'export', basePath: '/Aangan-Studio', assetPrefix: '/Aangan-Studio/' }
    : {}),
  // The results page reads nothing from disk; the transcript text is embedded.
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
