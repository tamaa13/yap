import { describe, expect, it } from "vitest";
import {
  BATTLE_ESCROW_ADDRESS,
  FIGHTER_INFT_ADDRESS,
  RENTAL_ESCROW_ADDRESS,
} from "@/lib/contracts";
import { NETWORK, zg0GTestnet } from "@/lib/chains";

describe("Phase A test harness", () => {
  it("boots vitest", () => {
    expect(1 + 1).toBe(2);
  });

  it("resolves @/* path alias", () => {
    expect(NETWORK).toBe("testnet");
    expect(zg0GTestnet.id).toBe(16602);
  });

  it("seeds contract addresses from vitest env", () => {
    expect(FIGHTER_INFT_ADDRESS).toBe("0x0000000000000000000000000000000000000a01");
    expect(BATTLE_ESCROW_ADDRESS).toBe("0x0000000000000000000000000000000000000a02");
    expect(RENTAL_ESCROW_ADDRESS).toBe("0x0000000000000000000000000000000000000a05");
  });
});
