# Deployed contracts

All deployments live on **0G Galileo testnet** (chainId `16602`).

Mainnet (Aristotle, chainId `16661`) deploy is intentionally held until
0G broker bug #6 (TLS cert validation in routing-proof attestation)
clears upstream. See [bug catalog](bug-catalog.md).

## Contract addresses

| Contract | Role | Address |
|---|---|---|
| `YapFighter` | ERC-7857 character INFT — encrypted persona payload | `0xd023b0c5b0ccc829dbf0b39df5e81aece4d36a24` |
| `BattleEscrow` | Match lifecycle + pari-mutuel pool + verdict verification | `0x4bd214fdfe925124c9e145e577ac860c0d93fb2e` |
| `BattleRegistry` | On-chain match history + ELO ledger | `0x755ef230d456b6cc991ccfff38ec5c6b0133d37b` |
| `YapMarketplace` | Buy / sell escrow for fighters | `0x076e42a64e4ba43700ebb0830086138468dfa275` |
| `RentalEscrow` | Custody-based rentals + co-signed dispute resolution | `0xe5Df2d51ef75A268daAd122038D94cEA9c3111EA` |
| `MomentINFT` | ERC-7857 sibling — round highlights as collectibles | `0xf6cadAb5276A16b7C8213CD7B6BBB547f55be4AC` |
| `MomentMarketplace` | Buy / sell escrow for Battle Moments | `0x18653aa16a4ffc7093be0270ab427688dfd2fb81` |
| `YapSubnameRegistrar` | `<label>.yap.0g` ENS-style subname registry | `0xb84c024c3456b7c82ad8a08bf4b7c69804bbd56f` |
| `YapInbox` | Stateless A2A encrypted messaging | `0xe92dB21A770c32a19795556C46D5c6a274955DBD` |

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
