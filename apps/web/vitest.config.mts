import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// `process.env.NEXT_PUBLIC_*` values are read at module-init by lib/chains.ts
// and lib/contracts.ts. Vitest applies `test.env` before any test or setup
// file runs, so imports through `@/lib/...` see deterministic placeholders
// instead of leaking dev `.env.local` values into the test harness.
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    css: false,
    include: ["tests/**/*.test.{ts,tsx}", "**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "dist", "tests/utils/**", "tests/mocks/**"],
    env: {
      NEXT_PUBLIC_NETWORK: "testnet",
      NEXT_PUBLIC_YAP_FIGHTER_ADDR_TESTNET: "0x0000000000000000000000000000000000000a01",
      NEXT_PUBLIC_BATTLE_ESCROW_ADDR_TESTNET: "0x0000000000000000000000000000000000000a02",
      NEXT_PUBLIC_BATTLE_REGISTRY_ADDR_TESTNET: "0x0000000000000000000000000000000000000a03",
      NEXT_PUBLIC_MARKETPLACE_ADDR_TESTNET: "0x0000000000000000000000000000000000000a04",
      NEXT_PUBLIC_RENTAL_ESCROW_ADDR_TESTNET: "0x0000000000000000000000000000000000000a05",
      NEXT_PUBLIC_YAP_INBOX_ADDR_TESTNET: "0x0000000000000000000000000000000000000a06",
      NEXT_PUBLIC_YAP_SUBNAME_ADDR_TESTNET: "0x0000000000000000000000000000000000000a07",
      NEXT_PUBLIC_MOMENT_INFT_ADDR_TESTNET: "0x0000000000000000000000000000000000000a08",
      NEXT_PUBLIC_MOMENT_MARKET_ADDR_TESTNET: "0x0000000000000000000000000000000000000a09",
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "placeholder",
    },
  },
});
