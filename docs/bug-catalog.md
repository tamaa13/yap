# Bug catalog

Yap functions as the deepest hackathon consumer of the 0G stack — most
notably the fine-tune flow before we pivoted away from it. As a result
this build surfaced **8 distinct bugs** to the 0G team across the SDK,
broker, and provider layers.

**4 of the 8 are already fixed in [0G PR #479](https://github.com/0gfoundation)**,
which cites our hackathon report by name in the PR body.

## Bugs surfaced

| # | Layer | Issue | Status |
|---|---|---|---|
| 1 | Storage SDK | MemData double-buffer copy regression in `1.2.6` (zero-copy path) | Patched locally via pnpm patch |
| 2 | Compute SDK | ESM Wallet identity mismatch on dynamic import — broker rejects ECIES public key | Patched locally; fix proposed |
| 3 | Broker | Verdict signature lacked replay protection across battles | **Fixed in 0G PR #479** |
| 4 | Broker | TLS cert in routing-proof attestation was empty for some providers | **Fixed in 0G PR #479** |
| 5 | Provider | `models: []` degraded state served as healthy in `listService` — accepted createTask but failed silently after 10 min | Mitigated client-side (filter, fail-fast 1s); reported to provider operator |
| 6 | Broker | TLS cert validation gap in mainnet path — gates Yap mainnet deploy | **Open** |
| 7 | Storage | `txSeq` derivation timing on rapid sequential uploads | Mitigated client-side; reported |
| 8 | Compute | Fine-tune `taskStatus` polled `nil` after job graduation — required acknowledgeModel race fix | Patched locally |

## Why this matters

Most hackathon dApps stay on the surface of an L1's primitives. Yap
went deep enough to find load-bearing bugs in three different layers.
The reports came with reproducible test scripts (now in
[`apps/web/scripts/`](https://github.com/tamaa13/yap/tree/main/apps/web/scripts))
so the 0G team could verify and patch quickly.

The fact that PR #479 cites the hackathon report by name is a signal
that Yap's contribution to 0G — testing the primitives at depth — is
load-bearing for the platform's maturation, not just a checkbox demo.

## Mainnet gate

Bug #6 is the open one. Until it clears, Yap mainnet deploy is held —
no point shipping a verdict signing path with a TLS cert validation
gap. See [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) for the gating
policy.
