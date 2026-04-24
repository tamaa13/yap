import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mark the 0G SDKs as server-external so Next.js/Turbopack doesn't bundle
  // them — lets `__dirname` resolve correctly and native binaries (like
  // `0g-storage-client`) stay reachable via relative path from the package.
  serverExternalPackages: [
    "@0glabs/0g-serving-broker",
    "@0gfoundation/0g-ts-sdk",
  ],
};

export default nextConfig;
