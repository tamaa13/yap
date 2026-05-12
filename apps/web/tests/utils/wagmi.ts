import { http } from "viem";
import { createConfig } from "wagmi";
import { mock } from "wagmi/connectors";
import { zg0GTestnet } from "@/lib/chains";

/** Stable account injected by the mock connector. Lower-cased everywhere
 *  the app compares addresses, so tests can use this value directly. */
export const TEST_USER: `0x${string}` = "0x1111111111111111111111111111111111111111";
export const TEST_USER_B: `0x${string}` = "0x2222222222222222222222222222222222222222";
export const TEST_USER_C: `0x${string}` = "0x3333333333333333333333333333333333333333";

/** Build an isolated wagmi config per test. Reusing a single module-level
 *  config leaks state between tests (connection status, query cache,
 *  pending mutations) and causes flaky cross-test interference. */
export function createTestWagmiConfig(account: `0x${string}` = TEST_USER) {
  return createConfig({
    chains: [zg0GTestnet],
    connectors: [mock({ accounts: [account], features: { reconnect: true } })],
    transports: {
      [zg0GTestnet.id]: http(zg0GTestnet.rpcUrls.default.http[0]),
    },
    ssr: false,
  });
}
