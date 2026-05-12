# Deployed contracts

All deployments live on **0G Galileo testnet** (chainId `16602`).

Mainnet (Aristotle, chainId `16661`) deploy is intentionally held until
0G broker bug #6 (TLS cert validation in routing-proof attestation)
clears upstream. See [bug catalog](bug-catalog.md).

## Contract addresses

| Contract | Role | Address |
|---|---|---|
| `YapFighter` | ERC-7857 character INFT — encrypted persona payload | `0xc2A82B1c6cb820ccf0C7732F40733A4101615CA2` |
| `BattleEscrow` | Match lifecycle + pari-mutuel pool + verdict verification + 5% fighter royalty | `0xC3a196f1e25485E1059199c2F4D2afdd07043Cb8` |
| `BattleRegistry` | On-chain match history + ELO ledger + lifetime earnings | `0x8A665bd7dFed87A1d6B87f1e5ecbc70E08fb7bD3` |
| `YapMarketplace` | Buy / sell escrow for fighters | `0xf4e65e53b203E4EF64Fedfe0C77BD83C56f7CEf1` |
| `RentalEscrow` | Custody-based rentals + co-signed dispute resolution | `0xad7b130d1ED52e33F1c64C7349E4994423e19E5b` |
| `MomentINFT` | ERC-7857 sibling — round highlights as collectibles | `0xde6f1Ad216B2de19DBE5418c278DDbec1633092f` |
| `MomentMarketplace` | Buy / sell escrow for Battle Moments | `0xDC77b8a4BE9C1aaAAFb80a3342A457700E070c20` |
| `YapSubnameRegistrar` | `<label>.yap.0g` ENS-style subname registry | `0xD9c17C941C6307FbBf4fB6A9959Fc6d7490CCb31` |
| `YapInbox` | Stateless A2A encrypted messaging | `0xe92dB21A770c32a19795556C46D5c6a274955DBD` |

> Eight contracts redeployed on **2026-05-13** via the Strategy A
> full-cascade ceremony — v3 layered fighter royalty + RUNNER_ROLE on
> top of the Phase-3 audit-pass bytecode. v1 ecosystem (fighters,
> subnames, rentals, listings) is orphaned by design. `YapInbox` is
> unchanged (separate CREATE2 path, identical bytecode).

## TEE provider

Verdict signatures recover to the provider's TEE-derived key. This
address is registered as `oracleKey` on `BattleEscrow`; the contract
fail-closes if recovery doesn't match.

| Field | Value |
|---|---|
| `oracleKey` (TEE signer address) | `0x83df4B8EbA7c0B3B740019b8c9a77ffF77D508cF` |
| Compute provider | `0xa48f01287233509FD694a22Bf840225062E67836` |
| Settlement chain | Galileo (16602) |

## Source

Solidity sources, deployment scripts, and full test suite live under
[`contracts/`](https://github.com/tamaa13/yap/tree/main/contracts) in
the repo. Built with Foundry, `--evm-version cancun`. 18 test files,
fork tests against the live Galileo deploy.
