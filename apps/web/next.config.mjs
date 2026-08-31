/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow GCS image URLs in next/image
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
    ],
  },
  // Transpile MapLibre (ESM)
  transpilePackages: ["maplibre-gl"],
};

export default nextConfig;
