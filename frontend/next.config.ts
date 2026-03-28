import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    // Proxy API and media requests to the backend.
    // In Docker: "backend:8000"; bare-metal: "localhost:8000".
    const dest = process.env.API_BACKEND_URL || "http://localhost:8000";
    return [
      { source: "/api/:path*", destination: `${dest}/api/:path*` },
      { source: "/thumbnails/:path*", destination: `${dest}/thumbnails/:path*` },
    ];
  },
};

export default nextConfig;
