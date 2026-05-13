"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useWalletClient } from "wagmi";
import type { ZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import { createUserBroker } from "@/lib/0g/client/compute";
import {
  scorePersona,
  type ScoredAttestation,
  type ScoreInput,
} from "@/lib/0g/client/score-persona";

/**
 * Client-side persona scoring state machine.
 *
 * Drives the mint UI through the explicit funding prompts that
 * Opsi B's user-pays model requires:
 *
 *   idle
 *     ↓ start()
 *   probing                     – read ledger + sub-account state
 *     ↓
 *   needs_ledger                – wallet has no ledger account (or
 *     ↓ deposit()                  drained below threshold)
 *   waiting_deposit             – tx pending
 *     ↓
 *   needs_sub_account           – sub-account balance < threshold for
 *     ↓ transfer()                  the chosen provider
 *   waiting_transfer            – tx pending
 *     ↓
 *   scoring                     – 15 LLM judge calls + canonical echo
 *     ↓                            + signature fetch via the user's
 *   done | error                  wallet's spendable balance
 *
 * The hook surfaces explicit `deposit()` / `transfer()` actions so the
 * UI can render dedicated cards ("This is a one-time setup tx funding
 * your scoring credit") rather than the wallet popping unexpectedly
 * mid-mint.
 *
 * Funding thresholds are imported via `lib/0g/client/inference.ts`'s
 * `ensureFunded` (used as fallback if either probe misses). The state-
 * machine path is the happy path; ensureFunded is the rail in case
 * the wallet's balance drained between probe and scorePersona run.
 */
export type ScorePersonaPhase =
  | "idle"
  | "probing"
  | "needs_ledger"
  | "waiting_deposit"
  | "needs_sub_account"
  | "waiting_transfer"
  | "scoring"
  | "done"
  | "error";

export interface ScorePersonaState {
  phase: ScorePersonaPhase;
  error: string | null;
  attestation: ScoredAttestation | null;
  /** Available ledger balance in OG (as Number for UI display).
   *  Captured during the probe step; `null` before the first probe
   *  or when getLedger() throws (which usually means no ledger
   *  account yet). */
  ledgerAvailable: number | null;
  /** Spendable sub-account balance in OG (balance - pendingRefund),
   *  same caveat — `null` before probe or on bootstrap. */
  subAccountSpendable: number | null;
}

const NEXT_PUBLIC_LEDGER_DEPOSIT = Number(
  process.env.NEXT_PUBLIC_ZG_COMPUTE_LEDGER_DEPOSIT ?? 3,
);

function weiToOg(wei: bigint): number {
  return Number(wei) / 1e18;
}

/** State machine driver for client-side persona scoring. Returns
 *  `state` (snapshot) + `start` (entry) + `deposit` / `transfer`
 *  (action handlers per phase) + `reset`. */
export function useScorePersona(input: ScoreInput | null): {
  state: ScorePersonaState;
  start: () => Promise<void>;
  deposit: () => Promise<void>;
  transfer: () => Promise<void>;
  reset: () => void;
} {
  const { data: walletClient } = useWalletClient();
  const [state, setState] = useState<ScorePersonaState>({
    phase: "idle",
    error: null,
    attestation: null,
    ledgerAvailable: null,
    subAccountSpendable: null,
  });
  // Broker is cached per (wallet address × provider) for the lifetime
  // of a single scoring run. Stored in a ref to avoid re-construction
  // on every state transition.
  const brokerRef = useRef<ZGComputeNetworkBroker | null>(null);
  const providerAddrRef = useRef<string | null>(null);

  // viem WalletClient's `.request` is EIP-1193 shaped; wrap into
  // ethers.BrowserProvider via the createUserBroker helper. Bound
  // once per walletClient identity so reconnects rebuild the broker
  // against the new signer.
  const ensureBroker = useCallback(async (): Promise<ZGComputeNetworkBroker> => {
    if (brokerRef.current) return brokerRef.current;
    if (!walletClient) throw new Error("wallet not connected");
    const { broker } = await createUserBroker(
      walletClient as unknown as Parameters<typeof createUserBroker>[0],
    );
    brokerRef.current = broker;
    return broker;
  }, [walletClient]);

  const resolveProvider = useCallback((): string => {
    const envProvider = process.env.NEXT_PUBLIC_ZG_INFERENCE_PROVIDER;
    if (envProvider) return envProvider;
    // Without an explicit pin we fall back to the broker's first
    // listService() match — but that requires a broker round-trip.
    // For now require the env pin to keep state-machine deterministic.
    throw new Error(
      "NEXT_PUBLIC_ZG_INFERENCE_PROVIDER not set — pin the inference provider on the client",
    );
  }, []);

  /** Probe ledger + sub-account; route to the next phase. Returns the
   *  phase it transitioned to so the caller can chain. */
  const probe = useCallback(async (): Promise<ScorePersonaPhase> => {
    const broker = await ensureBroker();
    const providerAddress = resolveProvider();
    providerAddrRef.current = providerAddress;

    // Ledger probe.
    let ledgerOg: number | null = null;
    try {
      const ledger = await broker.ledger.getLedger();
      ledgerOg = weiToOg(ledger.availableBalance);
    } catch {
      // No ledger account → treat as zero, force the deposit step.
      ledgerOg = 0;
    }
    if (ledgerOg < 0.6) {
      setState((s) => ({
        ...s,
        phase: "needs_ledger",
        ledgerAvailable: ledgerOg,
        error: null,
      }));
      return "needs_ledger";
    }

    // Sub-account probe (only matters if ledger is funded).
    let subOg: number | null = null;
    try {
      const account = await broker.inference.getAccount(providerAddress);
      const spendable = account.balance - (account.pendingRefund ?? 0n);
      subOg = weiToOg(spendable);
    } catch {
      // "Sub-account not found" — bootstrap branch. Force a transfer.
      subOg = 0;
    }
    if (subOg < 0.1) {
      setState((s) => ({
        ...s,
        phase: "needs_sub_account",
        ledgerAvailable: ledgerOg,
        subAccountSpendable: subOg,
        error: null,
      }));
      return "needs_sub_account";
    }

    // Both branches green → ready to score.
    setState((s) => ({
      ...s,
      phase: "scoring",
      ledgerAvailable: ledgerOg,
      subAccountSpendable: subOg,
      error: null,
    }));
    return "scoring";
  }, [ensureBroker, resolveProvider]);

  /** Public entry. Probes funding state; if everything's green,
   *  immediately starts scoring. Otherwise the caller renders the
   *  per-phase prompt UI and invokes deposit() / transfer(). */
  const start = useCallback(async () => {
    setState((s) => ({ ...s, phase: "probing", error: null }));
    try {
      const phase = await probe();
      if (phase === "scoring" && input) {
        await runScoring();
      }
    } catch (e) {
      setState((s) => ({
        ...s,
        phase: "error",
        error: e instanceof Error ? e.message : "probe failed",
      }));
    }
    // runScoring is defined below; capture via closure is fine
    // (useCallback dep array tracked separately).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probe, input]);

  /** Action: deposit into the ledger contract via the user's wallet. */
  const deposit = useCallback(async () => {
    setState((s) => ({ ...s, phase: "waiting_deposit", error: null }));
    try {
      const broker = await ensureBroker();
      await broker.ledger.depositFund(NEXT_PUBLIC_LEDGER_DEPOSIT);
      // Probe again — should advance past `needs_ledger`. If it lands
      // on `scoring`, kick the run automatically.
      const next = await probe();
      if (next === "scoring" && input) {
        await runScoring();
      }
    } catch (e) {
      setState((s) => ({
        ...s,
        phase: "error",
        error: e instanceof Error ? e.message : "depositFund failed",
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensureBroker, probe, input]);

  /** Action: transfer from ledger → per-provider sub-account. */
  const transfer = useCallback(async () => {
    setState((s) => ({ ...s, phase: "waiting_transfer", error: null }));
    try {
      const broker = await ensureBroker();
      const providerAddress = providerAddrRef.current ?? resolveProvider();
      // 0.5 OG transfer — same as ensureFunded's TRANSFER_PER_PROVIDER.
      await broker.ledger.transferFund(
        providerAddress,
        "inference",
        // parseEther equivalent. Keeping local to avoid an extra import.
        500_000_000_000_000_000n,
      );
      const next = await probe();
      if (next === "scoring" && input) {
        await runScoring();
      }
    } catch (e) {
      setState((s) => ({
        ...s,
        phase: "error",
        error: e instanceof Error ? e.message : "transferFund failed",
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensureBroker, probe, resolveProvider, input]);

  const runScoring = useCallback(async () => {
    if (!input) {
      setState((s) => ({ ...s, phase: "error", error: "no input supplied" }));
      return;
    }
    setState((s) => ({ ...s, phase: "scoring", error: null }));
    try {
      const broker = await ensureBroker();
      const providerAddress = providerAddrRef.current ?? resolveProvider();
      const attestation = await scorePersona(broker, {
        ...input,
        providerAddress: input.providerAddress ?? providerAddress,
      });
      setState((s) => ({
        ...s,
        phase: "done",
        attestation,
        error: null,
      }));
    } catch (e) {
      setState((s) => ({
        ...s,
        phase: "error",
        error: e instanceof Error ? e.message : "scoring failed",
      }));
    }
  }, [ensureBroker, input, resolveProvider]);

  const reset = useCallback(() => {
    brokerRef.current = null;
    providerAddrRef.current = null;
    setState({
      phase: "idle",
      error: null,
      attestation: null,
      ledgerAvailable: null,
      subAccountSpendable: null,
    });
  }, []);

  return useMemo(
    () => ({ state, start, deposit, transfer, reset }),
    [state, start, deposit, transfer, reset],
  );
}
