"use client";

// Browser-side wrapper around the 0G Compute broker. Mirrors the
// server-side `lib/0g/compute.ts` but uses an EIP-1193 wallet signer
// (via `ethers.BrowserProvider`) so the connected user's wallet —
// not the server broker EOA — pays for persona scoring + tx fees.
//
// Opsi B (2026-05-13). See ARCHITECTURE notes in the score-persona
// migration brief for the economic rationale (Tama should not be
// subsidizing every user's mint scoring on mainnet).

import { BrowserProvider, type JsonRpcSigner } from "ethers";
import {
  createZGComputeNetworkBroker,
  type ZGComputeNetworkBroker,
} from "@0gfoundation/0g-compute-ts-sdk";

/** Build a fresh broker bound to the user's wallet. Cached per-signer
 *  address by the caller (mint page) — this helper just constructs.
 *
 *  `eip1193Provider` is the raw EIP-1193 object from wagmi's
 *  `useWalletClient()`. We wrap it in `ethers.BrowserProvider` so the
 *  compute SDK's `Wallet | JsonRpcSigner` accept path lights up. */
export async function createUserBroker(
  eip1193Provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> },
): Promise<{ broker: ZGComputeNetworkBroker; signer: JsonRpcSigner }> {
  const provider = new BrowserProvider(
    eip1193Provider as unknown as ConstructorParameters<typeof BrowserProvider>[0],
  );
  const signer = await provider.getSigner();
  const broker = await createZGComputeNetworkBroker(signer);
  return { broker, signer };
}
