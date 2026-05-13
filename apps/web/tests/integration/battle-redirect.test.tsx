import { describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import type { Battle, Fighter } from "@/lib/types";
import { renderWithProviders } from "../utils/render";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    replace: replaceMock,
  }),
}));

// Stub the hook surface ArenaLiveClient depends on. We're asserting the
// redirect effect, not re-exercising the underlying useBattle / useFighter
// integration (already locked in Phase B). Returning a `past` battle
// proves the v34/v35 redirect fires on the status the polling read
// surfaces from chain.
const battleHook = vi.fn();
const fighterAHook = vi.fn();
const fighterBHook = vi.fn();

vi.mock("@/hooks/use-battle", () => ({
  useBattle: () => battleHook(),
}));
vi.mock("@/hooks/use-fighter", () => ({
  useFighter: () => {
    // Distinguish A from B by call-order on the same render.
    const total = fighterAHook.mock.calls.length + fighterBHook.mock.calls.length;
    if (total % 2 === 0) return fighterAHook();
    return fighterBHook();
  },
}));

// ArenaLive + ArenaPending pull in extra hook trees we don't want to
// re-render here (RainbowKit modal, toast, accept-battle, etc.) — replace
// them with thin sentinel components so the redirect path is what's
// under test.
vi.mock("@/app/(app)/arenas/[battleId]/arena-live", () => ({
  ArenaLive: () => <div data-testid="arena-live" />,
}));
vi.mock("@/app/(app)/arenas/[battleId]/arena-pending", () => ({
  ArenaPending: () => <div data-testid="arena-pending" />,
}));

import { ArenaLiveClient } from "@/app/(app)/arenas/[battleId]/arena-live-client";

function dummyFighter(id: number): Fighter {
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
    traits: null,
  };
}

function dummyBattle(status: Battle["status"]): Battle {
  return {
    id: "b-002a",
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

describe("Integration: battle lifecycle past→result redirect (v34/v35)", () => {
  it("redirects to /arenas/:id/result on first render of a past battle", async () => {
    replaceMock.mockClear();
    battleHook.mockReturnValue({
      data: dummyBattle("past"),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    fighterAHook.mockReturnValue({
      data: dummyFighter(1),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    fighterBHook.mockReturnValue({
      data: dummyFighter(2),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithProviders(<ArenaLiveClient battleId="b-002a" />);

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/arenas/b-002a/result"),
    );
  });

  it("does NOT redirect for live battles — ArenaLive renders instead", async () => {
    replaceMock.mockClear();
    battleHook.mockReturnValue({
      data: dummyBattle("live"),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    fighterAHook.mockReturnValue({
      data: dummyFighter(1),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    fighterBHook.mockReturnValue({
      data: dummyFighter(2),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { findByTestId } = renderWithProviders(
      <ArenaLiveClient battleId="b-002a" />,
    );
    await findByTestId("arena-live");
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("renders ArenaPending for upcoming battles — no redirect", async () => {
    replaceMock.mockClear();
    battleHook.mockReturnValue({
      data: dummyBattle("upcoming"),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    fighterAHook.mockReturnValue({
      data: dummyFighter(1),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    fighterBHook.mockReturnValue({
      data: dummyFighter(2),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { findByTestId } = renderWithProviders(
      <ArenaLiveClient battleId="b-002a" />,
    );
    await findByTestId("arena-pending");
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
