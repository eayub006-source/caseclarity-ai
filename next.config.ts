import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // src/proxy.ts makes Next buffer request bodies (default cap 10 MB, which
    // silently truncates larger bodies). Allow the 10 MB upload limit plus
    // multipart overhead; /api/extract enforces the exact limit itself.
    proxyClientMaxBodySize: "11mb",
  },
};

export default nextConfig;
