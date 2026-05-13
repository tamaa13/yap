# Deployed contracts

All deployments live on **0G Galileo testnet** (chainId `16602`).

Mainnet (Aristotle, chainId `16661`) deploy is intentionally held until
0G broker bug #6 (TLS cert validation in routing-proof attestation)
clears upstream. See [bug catalog](bug-catalog.md).

## Contract addresses

| Contract | Role | Address |
|---|---|---|
| `YapFighter` | ERC-7857 character INFT + archetype + TEE-attested persona scoring | `0x066259CCB37C0AF962c112a70C6338e52e1D16ee` |
| `BattleEscrow` | Match lifecycle + pari-mutuel pool + verdict verification (via TEEAttestationLib) | `0x06c61C3112B98Afc16002bD523D26eF836e7e659` |
| `BattleRegistry` | On-chain match history + ELO ledger + lifetime earnings | `0x104a65bf0cB4fAE0F4bb606cE1694115Ce87F2A1` |
| `YapMarketplace` | Buy / sell escrow for fighters | `0x9569cE03CD9934Fd206A40b3721f7Ae3DC2a1f36` |
| `RentalEscrow` | Custody-based rentals + co-signed dispute resolution | `0xE986a6C47dA1fD3c0b01EC6695Ccf020EC16bC96` |
| `MomentINFT` | ERC-7857 sibling — round highlights as collectibles | `0x86cdEe1aF79dd9F56AA5358Eb0Ae39F96dbD4DbB` |
| `MomentMarketplace` | Buy / sell escrow for Battle Moments | `0x13f52f5787fcE95364Bf0CDeE96D5dB3ab4B12bD` |
| `YapSubnameRegistrar` | `<label>.yap.0g` ENS-style subname registry | `0xF5F99bd86b00ad32D16E1Ae97Dd4aaa7AdeD5c8C` |
| `AbilityEscrow` | Per-battle archetype-ability use tracking + trait-gate enforcement | `0x18563e7E015c9e5742485E47698E067FAff279e6` |
| `YapInbox` | Stateless A2A encrypted messaging | `0xe92dB21A770c32a19795556C46D5c6a274955DBD` |

> Nine contracts redeployed on **2026-05-13** via the Strategy A
> full-cascade ceremony — v3 layered TEE-attested persona scoring,
> mint-time archetype commitment, AbilityEscrow sidecar, and the
> reusable `TEEAttestationLib` on top of the v2 cascade. v2 ecosystem
> (fighters, subnames, rentals, listings) is orphaned by design.
> `YapInbox` is unchanged (separate CREATE2 path).

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
