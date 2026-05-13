import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { parseEther } from "viem";
import type { Battle, Fighter } from "@/lib/types";
import {
  BATTLE_ESCROW_ABI,
  BATTLE_ESCROW_ADDRESS,
} from "@/lib/contracts";
import { renderWithProviders } from "../utils/render";
import { rpcServer } from "../utils/rpc";
import { TEST_USER, TEST_USER_B, TEST_USER_C } from "../utils/wagmi";
import { server } from "../mocks/server";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;
const ZERO_HASH = `0x${"00".repeat(32)}` as const;

// User identity is fixed at TEST_USER for the entire suite; per-test
// iControl outcomes are driven by varying fighter.owner / .rentedBy.
vi.mock("@/hooks/use-wallet", () => ({
  useWallet: () => ({
    ready: true,
    connected: true,
    addr: TEST_USER,
    email: undefined,
    wallet: undefined,
    chainId: 16602,
    login: () => {},
    logout: () => {},
  }),
}));

vi.mock("@/hooks/use-accept-battle", () => ({
  useAcceptBattle: () => ({
    error: null,
    isPending: false,
    isConfirming: false,
    isSuccess: false,
    txHash: undefined,
    write: vi.fn().mockResolvedValue("0xabcdef"),
  }),
  useDeclineBattle: () => ({
    error: null,
    isPending: false,
    isConfirming: false,
    isSuccess: false,
    txHash: undefined,
    write: vi.fn().mockResolvedValue("0xabcdef"),
  }),
}));

vi.mock("@/hooks/use-subname", () => ({
  useSubname: () => ({
    label: null,
    fullName: null,
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

import { ArenaPending } from "@/app/(app)/arenas/[battleId]/arena-pending";

function fighter(opts: {
  id: number;
  owner: `0x${string}`;
  rentedBy?: `0x${string}` | null;
}): Fighter {
  return {
    id: opts.id,
    name: `Fighter ${opts.id}`,
    arch: "scholar",
    elo: 1200,
    w: 0,
    l: 0,
    earnings: 0,
    owner: opts.owner,
    forSale: false,
    forRent: false,
    color: "#ccc",
    hp: 50,
    logic: 50,
    wit: 50,
    tags: [],
    battles: 0,
    attest: "0x",
    rentedBy: opts.rentedBy ?? undefined,
    traits: null,
  };
}

function pendingBattle(): Battle {
  return {
    id: "b-0001",
    status: "upcoming",
    round: 0,
    maxRound: 3,
    topic: "coffee vs tea",
    a: 1,
    b: 2,
    pool: 0,
    spectators: 0,
    endsIn: null,
    startedAt: Date.now(),
    oddsA: 1,
    oddsB: 1,
  };
}

/** Stub the `battles(uint256)` mapping auto-getter — ArenaPending reads
 *  poolA from it to compute the 75% min defender match. We don't care
 *  about most fields for iControl assertions; return zeroed positional
 *  outputs with poolA set to 1 0G. */
function setBattlesAutoGetter(opts: { poolAWei: bigint }) {
  server.use(
    rpcServer([
      {
        to: BATTLE_ESCROW_ADDRESS as `0x${string}`,
        abi: BATTLE_ESCROW_ABI,
        functions: {
          battles: () => [
            1n, // fighterA
            2n, // fighterB
            ZERO_ADDR, // creator
            0n, // startTime
            0n, // verdictTime
            3, // maxRounds
            0, // winner
            0, // status
            opts.poolAWei, // poolA — the field ArenaPending reads
            0n, // poolB
            0n, // feeCollected
            "", // topic
            "0x", // verdictSig
            ZERO_HASH, // verdictHash
            0n, // totalClaimed
            0n, // settledAt
            0n, // royaltyPaid
          ],
        },
      },
    ]),
  );
}

describe("ArenaPending iControl (v31)", () => {
  it("OWNER (no renter) sees Step in + Decline on fighterB they own", async () => {
    setBattlesAutoGetter({ poolAWei: parseEther("1") });
    renderWithProviders(
      <ArenaPending
        uiId="b-0001"
        battle={pendingBattle()}
        fighterA={fighter({ id: 1, owner: TEST_USER_B })}
        fighterB={fighter({ id: 2, owner: TEST_USER })}
      />,
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /step in|stake too low/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /decline/i })).toBeInTheDocument();
  });

  it("RENTER sees Step in even though fighterB.owner is RentalEscrow (v31 fix)", async () => {
    // The exact bug from v31: original owner is RentalEscrow's vault
    // address, current user is the active renter. Pre-v31 logic gated
    // Accept on `owner === addr`, which hid the button. iControl now
    // returns true when `rentedBy === addr` regardless of `owner`.
    setBattlesAutoGetter({ poolAWei: parseEther("1") });
    renderWithProviders(
      <ArenaPending
        uiId="b-0001"
        battle={pendingBattle()}
        fighterA={fighter({ id: 1, owner: TEST_USER_B })}
        fighterB={fighter({
          id: 2,
          owner: "0x4444444444444444444444444444444444444444",
          rentedBy: TEST_USER,
        })}
      />,
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /step in|stake too low/i }),
      ).toBeInTheDocument(),
    );
  });

  it("OWNER LOSES CONTROL when fighter is currently rented out — buttons hidden", async () => {
    // I own fighterB but I've rented it to someone else. iControl says
    // I no longer have operational control: lessor sees the spectator
    // wait copy, not Accept/Decline.
    setBattlesAutoGetter({ poolAWei: parseEther("1") });
    renderWithProviders(
      <ArenaPending
        uiId="b-0001"
        battle={pendingBattle()}
        fighterA={fighter({ id: 1, owner: TEST_USER_B })}
        fighterB={fighter({ id: 2, owner: TEST_USER, rentedBy: TEST_USER_C })}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /step in/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /stake too low/i })).not.toBeInTheDocument();
    });
    // Spectator copy renders for non-controllers.
    expect(
      screen.getByText(/Defender hasn't stepped in yet/i),
    ).toBeInTheDocument();
  });

  it("CHALLENGER (iControl on fighterA, not fighterB) sees the 'waiting for defender' copy", async () => {
    setBattlesAutoGetter({ poolAWei: parseEther("1") });
    renderWithProviders(
      <ArenaPending
        uiId="b-0001"
        battle={pendingBattle()}
        fighterA={fighter({ id: 1, owner: TEST_USER })}
        fighterB={fighter({ id: 2, owner: TEST_USER_B })}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/Defender's on the clock/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /step in/i })).not.toBeInTheDocument();
  });

  it("STAKE GATE: defender stake below 75% disables Accept with 'Stake too low' copy", async () => {
    // Challenger staked 1 0G; defender input should default to 1 0G (full
    // match) which is >= 75%. To assert the disabled path, push the
    // input below 0.75.
    setBattlesAutoGetter({ poolAWei: parseEther("1") });
    const { container } = renderWithProviders(
      <ArenaPending
        uiId="b-0001"
        battle={pendingBattle()}
        fighterA={fighter({ id: 1, owner: TEST_USER_B })}
        fighterB={fighter({ id: 2, owner: TEST_USER })}
      />,
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /step in/i })).toBeInTheDocument(),
    );
    const input = container.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    // Simulate typing a sub-75% value. `0.5` < 0.75 of `1`.
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, "0.5");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /stake too low/i }),
      ).toBeInTheDocument(),
    );
  });
});
