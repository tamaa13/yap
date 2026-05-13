import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 0g-ts-sdk (storage) stays server-external — it pulls a native binary
  // `0g-storage-client` and uses Node fs/path APIs without a browser
  // shim. Storage operations always run via the API routes.
  //
  // 0g-compute-ts-sdk (inference + ledger) used to be server-external
  // too, but Opsi B (2026-05-13 client-side scoring) needs it in the
  // browser bundle so the user's wallet — not the server broker EOA —
  // pays for persona scoring. The SDK ships a `browser` field in its
  // package.json that maps `crypto` → `crypto-browserify`, `stream` →
  // `stream-browserify`, and stubs `fs/os/path/net/tls/child_process/
  // readline` as false. Webpack/Turbopack pick those up automatically.
  // The TDX-quote `dcap-qvl` wasm only loads on the verifiable-provider
  // attestation path (not the inference write path we use), and the
  // `0g-storage-client` native binary is dead code for the inference
  // subpath the client touches.
  serverExternalPackages: ["@0gfoundation/0g-ts-sdk"],
  // Turbopack respects the compute SDK's `browser` field (in its
  // package.json) for the node-built-in stubs, so no explicit
  // `resolveAlias` overrides are needed for the inference subpath.
  // An empty `turbopack: {}` is set explicitly so Next 16's default
  // Turbopack runner doesn't warn about the absence of one.
  turbopack: {},
};

export default nextConfig;
