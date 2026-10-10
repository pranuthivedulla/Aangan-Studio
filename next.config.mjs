/** @type {import('next').NextConfig} */
const nextConfig = {
  // The results page reads the transcript file from context/ at build time, so
  // that file has to travel with the serverless bundle.
  outputFileTracingIncludes: {
    '/results': ['./context/enquiries/**'],
  },
  // No image optimisation, no analytics, no telemetry we did not ask for.
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
