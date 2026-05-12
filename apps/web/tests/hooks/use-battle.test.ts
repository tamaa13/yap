import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  BATTLE_ESCROW_ABI,
  BATTLE_ESCROW_ADDRESS,
} from "@/lib/contracts";
import { useBattle } from "@/hooks/use-battle";
import { renderHookWithProviders } from "../utils/render";
import { rpcServer } from "../utils/rpc";
import { server } from "../mocks/server";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;
const ZERO_BYTES = `0x${"00".repeat(32)}` as const;

function battleStruct({
  status = 1,
  fighterA = 1n,
  fighterB = 2n,
  winner = 0,
  startTime = 1700000000n,
  verdictTime = 0n,
}: {
  status?: number;
  fighterA?: bigint;
  fighterB?: bigint;
  winner?: number;
  startTime?: bigint;
  verdictTime?: bigint;
} = {}) {
  return {
    fighterA,
    fighterB,
    creator: ZERO_ADDR as `0x${string}`,
    startTime,
    verdictTime,
    maxRounds: 3,
    winner,
    status,
    poolA: 0n,
    poolB: 0n,
    feeCollected: 0n,
    topic: "coffee vs tea",
    verdictSig: "0x" as `0x${string}`,
    verdictHash: ZERO_BYTES as `0x${string}`,
    totalClaimed: 0n,
    settledAt: 0n,
  };
}

describe("useBattle", () => {
  it("returns null when the ui id is malformed", async () => {
    const { result } = renderHookWithProviders(() => useBattle("not-a-battle-id"));
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("decodes the on-chain battle struct into the UI Battle shape", async () => {
    server.use(
      rpcServer([
        {
          to: BATTLE_ESCROW_ADDRESS as `0x${string}`,
          abi: BATTLE_ESCROW_ABI,
          functions: {
            getBattle: (args: readonly unknown[]) => {
              const [id] = args as readonly [bigint];
              expect(id).toBe(0x2an); // b-002a → 0x2a = 42
              return battleStruct({ status: 1, fighterA: 7n, fighterB: 9n });
            },
          },
        },
      ]),
    );

    const { result } = renderHookWithProviders(() => useBattle("b-002a"));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data?.status).toBe("live");
    expect(result.current.data?.id).toBe("b-002a");
    expect(result.current.data?.a).toBe(7);
    expect(result.current.data?.b).toBe(9);
    expect(result.current.data?.topic).toBe("coffee vs tea");
  });

  it("re-decodes status when the on-chain value changes (polling proxy)", async () => {
    // Mutable status — the dispatcher reads it fresh each call, simulating
    // a status transition between the initial fetch and the polled fetch.
    // The hook is wired with `refetchInterval: 6_000` on the wagmi query;
    // exercising refetch directly proves the decode pipeline keeps up with
    // the latest read without coupling the assertion to react-query's
    // setInterval-driven scheduling.
    let onChainStatus = 1;
    server.use(
      rpcServer([
        {
          to: BATTLE_ESCROW_ADDRESS as `0x${string}`,
          abi: BATTLE_ESCROW_ABI,
          functions: {
            getBattle: () => battleStruct({ status: onChainStatus, winner: 0 }),
          },
        },
      ]),
    );

    const { result } = renderHookWithProviders(() => useBattle("b-0001"));
    await waitFor(() => expect(result.current.data?.status).toBe("live"));

    // Verdict reached on-chain.
    onChainStatus = 3;
    await result.current.refetch();
    await waitFor(() => expect(result.current.data?.status).toBe("past"));
  });
});
