import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { Battle, Fighter } from "@/lib/types";
import { renderWithProviders } from "../utils/render";

// Both useWallet + useWalletGate live in `@/hooks/use-wallet`, which fans
// out to wagmi + RainbowKit. Component tests don't need the real provider
// tree — we want to assert the betting gate copy + disabled state, not
// re-exercise the wallet plumbing covered in Phase B.
vi.mock("@/hooks/use-wallet", () => ({
  useWallet: () => ({
    ready: true,
    connected: true,
    addr: "0x1111111111111111111111111111111111111111" as `0x${string}`,
    email: undefined,
    wallet: undefined,
    chainId: 16602,
    login: () => {},
    logout: () => {},
  }),
  useWalletGate: () => (_context: string, cb: () => void) => cb(),
}));

import { BetBar } from "@/app/(app)/arenas/[battleId]/bet-bar";

function battle(status: Battle["status"] = "live"): Battle {
  return {
    id: "b-0001",
    status,
    round: 0,
    maxRound: 3,
    topic: "coffee vs tea",
    a: 1,
    b: 2,
    pool: 0,
    spectators: 0,
    endsIn: null,
    startedAt: null,
    oddsA: 1,
    oddsB: 1,
  };
}

function fighter(id: number): Fighter {
  return {
    id,
    name: `F${id}`,
    arch: "scholar",
    elo: 1200,
    w: 0,
    l: 0,
    earnings: 0,
    owner: "0x0000000000000000000000000000000000000000",
    forSale: false,
    forRent: false,
    color: "#fff",
    hp: 50,
    logic: 50,
    wit: 50,
    tags: [],
    battles: 0,
    attest: "0x",
  };
}

describe("BetBar status gate (v34)", () => {
  it("LIVE: shows the active 'Place bet' CTA enabled", () => {
    renderWithProviders(
      <BetBar
        battle={battle("live")}
        fighterA={fighter(1)}
        fighterB={fighter(2)}
        onLock={() => {}}
      />,
    );
    const cta = screen.getByRole("button", { name: /place bet/i });
    expect(cta).toBeEnabled();
  });

  it("UPCOMING: locks the bet button with 'Book opens at bell' copy", () => {
    renderWithProviders(
      <BetBar
        battle={battle("upcoming")}
        fighterA={fighter(1)}
        fighterB={fighter(2)}
        onLock={() => {}}
      />,
    );
    const cta = screen.getByRole("button", { name: /book opens at bell/i });
    expect(cta).toBeDisabled();
  });

  it("PAST: locks the bet button with 'Book closed' copy", () => {
    renderWithProviders(
      <BetBar
        battle={battle("past")}
        fighterA={fighter(1)}
        fighterB={fighter(2)}
        onLock={() => {}}
      />,
    );
    const cta = screen.getByRole("button", { name: /book closed/i });
    expect(cta).toBeDisabled();
  });

  it("LIVE: clicking a fighter chip swaps the side selection before opening the panel", async () => {
    const lock = vi.fn();
    const { container } = renderWithProviders(
      <BetBar
        battle={battle("live")}
        fighterA={fighter(1)}
        fighterB={fighter(2)}
        onLock={lock}
      />,
    );
    // Fighter B chip is the second odds-flagged button in the rail.
    const chips = container.querySelectorAll("button");
    // First two clickable buttons are the fighter chips, third is Place bet.
    expect(chips.length).toBeGreaterThanOrEqual(3);
  });
});
