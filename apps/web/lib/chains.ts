import { defineChain } from "viem";

export const zg0GChain = defineChain({
  id: 16661,
  name: "0G Aristotle",
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  rpcUrls: { default: { http: ["https://evmrpc.0g.ai"] } },
  blockExplorers: {
    default: { name: "ChainScan", url: "https://chainscan.0g.ai" },
  },
});

export const zg0GTestnet = defineChain({
  id: 16602,
  name: "0G Galileo",
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  rpcUrls: { default: { http: ["https://evmrpc-testnet.0g.ai"] } },
  blockExplorers: {
    default: {
      name: "ChainScan Galileo",
      url: "https://chainscan-galileo.0g.ai",
    },
  },
  testnet: true,
});

export const NETWORK =
  (process.env.NEXT_PUBLIC_NETWORK as "testnet" | "mainnet") ?? "testnet";

export const activeChain = NETWORK === "mainnet" ? zg0GChain : zg0GTestnet;
