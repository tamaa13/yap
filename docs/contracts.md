# Deployed contracts

Yap runs on **0G mainnet — Aristotle** (chainId `16661`). The previous
testnet ecosystem (Galileo, chainId `16602`) has been migrated; testnet
addresses are preserved below as historical reference.

## Mainnet (Aristotle, 16661) — canonical

| Contract | Role | Address |
|---|---|---|
| `YapFighter` | ERC-7857 character INFT + archetype + TEE-attested persona scoring + 0.1 OG mint fee | `0x3a3b176E91AE3Da4eF3a6B968E84120fC61CFd2b` |
| `BattleEscrow` | Match lifecycle + pari-mutuel pool + verdict verification (via TEEAttestationLib) | `0x311ecf5B66Ab569Bcb4cB96e7b4085CA2b59b037` |
| `BattleRegistry` | On-chain match history + ELO ledger + lifetime earnings | `0xda4f5279e677576831Fb5d99f2C754D5407030ee` |
| `YapMarketplace` | Buy / sell escrow for fighters | `0xb20769dD18F1438CA0aDa66Adf9ba670Cab6b9B0` |
| `RentalEscrow` | Custody-based rentals + co-signed dispute resolution | `0x6b89A8E306E3E567598A6233F10D6c410da07eB8` |
| `MomentINFT` | ERC-7857 sibling — round highlights as collectibles | `0x42C85f0EAa8Aef98c0ec1057e6c241769861A1aF` |
| `MomentMarketplace` | Buy / sell escrow for Battle Moments | `0x0514c5F6a9b7a57d329f41125C9E84C805F3Be7c` |
| `YapSubnameRegistrar` | `<label>.yap.0g` ENS-style subname registry | `0x4aC6E562b1b3CF9B2c0B6A3789200E889eD7576d` |
| `AbilityEscrow` | Per-battle archetype-ability use tracking + trait-gate enforcement | `0x07E47975Aac222B0D82DB8b5f5A6a24Fd87C7148` |
| `YapInbox` | Stateless A2A encrypted messaging | `0xe92dB21A770c32a19795556C46D5c6a274955DBD` |

> v4 cascade deployed **2026-05-13**. YapFighter now charges a
> `mintFee` (0.1 OG default) on `mint()` — fee accrues to treasury,
> the broker EOA that funds 0G Compute scoring. Only `YapInbox` keeps
> its address across the cascade; every other contract has a new
> address because of the fee field + cascade dependency redeploys.
> Previous v3 mainnet addresses are preserved at the bottom of this
> file for transaction-history lookups.

### TEE provider (mainnet)

| Field | Value |
|---|---|
| Model | `qwen3.6-plus` (1M context, roleplay-tuned, non-thinking) |
| Compute provider | `0x992e6396157Dc4f22E74F2231235D7DE62696db5` |
| `oracleKey` (TEE signer) | `0xd45b4301940B297F76d6e622c1CeA2AE660617d4` |
| `scoreOracleKey` (mint-time persona scoring) | `0xd45b4301940B297F76d6e622c1CeA2AE660617d4` |
| Architecture | Separated-centralized (TeeTLS routing-proof) |
| Provider endpoint | `compute-network-18.integratenetwork.work` |

Same TEE signer attests both battle verdicts AND mint-time persona
scores — one trust assumption, two callsites.

### Runner role (server-side `logAccess` calls)

| Field | Value |
|---|---|
| Runner wallet | `0xe5e0bf763be8CF6a7BBA1B18Fa5Ca110b0587fdC` |
| `RUNNER_ROLE` granted on YapFighter | tx `0x8f6d6d904f242992130f736b1a94d89cd2be46e95fc875df6bef805c872b7a43` |

### Live demo

- **App**: <https://yap-arena.xyz>
- **Explorer**: <https://chainscan.0g.ai>

### Mainnet E2E numerical proof (battle 1, settled 2026-05-13)

- pools: A=0.006, B=0.005, total=0.011 OG
- `battle.feeCollected` = 0.000275 OG (2.5% ✓)
- `battle.royaltyPaid` = 0.00055 OG (5% to fighter A owner ✓)
- `battle.totalClaimed` = 0.010175 OG (bettor share ✓)
- `registry.fighterStats(1).earnings` = 0.00055 OG ✓
- `fighter.getAccessCount(1)` = 1 ✓ (RUNNER_ROLE logAccess fires)
- Note: `battleDAEpoch[1]` = 0 — DASigners precompile not active on
  Aristotle yet; contract's low-level-staticcall fallback recorded
  zero gracefully without blocking settlement.

## Mainnet v3 (Aristotle, 16661) — historical pre-v4

Superseded by the v4 cascade on 2026-05-13. Preserved for tx-history
lookups; do NOT point new clients at these.

| Contract | v3 Address |
|---|---|
| `YapFighter` | `0x066259CCB37C0AF962c112a70C6338e52e1D16ee` |
| `BattleEscrow` | `0x242d1cd3100706b26a3067dd64cecb415a20f398` |
| `BattleRegistry` | `0x4ec3eb96161fbef86849d40a5d331d3c1209d5de` |
| `YapMarketplace` | `0x9569cE03CD9934Fd206A40b3721f7Ae3DC2a1f36` |
| `RentalEscrow` | `0xE986a6C47dA1fD3c0b01EC6695Ccf020EC16bC96` |
| `MomentINFT` | `0x059adf223c3281302d25ac36a4f861ef4b5df169` |
| `MomentMarketplace` | `0x35125df161d64a8ac59936c0dbfcfe30c9f4220d` |
| `YapSubnameRegistrar` | `0xF5F99bd86b00ad32D16E1Ae97Dd4aaa7AdeD5c8C` |
| `AbilityEscrow` | `0x2cc877baa12be163973a43cac998b8d82b3a58a4` |
| `YapInbox` | `0xe92dB21A770c32a19795556C46D5c6a274955DBD` (carried into v4) |

## Testnet (Galileo, 16602) — historical

Mainnet supersedes testnet as of 2026-05-13. Testnet contracts are
preserved (not actively maintained):

| Contract | Testnet Address |
|---|---|
| `YapFighter` | `0x066259CCB37C0AF962c112a70C6338e52e1D16ee` |
| `BattleEscrow` | `0x06c61C3112B98Afc16002bD523D26eF836e7e659` |
| `BattleRegistry` | `0x104a65bf0cB4fAE0F4bb606cE1694115Ce87F2A1` |
| `YapMarketplace` | `0x9569cE03CD9934Fd206A40b3721f7Ae3DC2a1f36` |
| `RentalEscrow` | `0xE986a6C47dA1fD3c0b01EC6695Ccf020EC16bC96` |
| `MomentINFT` | `0x86cdEe1aF79dd9F56AA5358Eb0Ae39F96dbD4DbB` |
| `MomentMarketplace` | `0x13f52f5787fcE95364Bf0CDeE96D5dB3ab4B12bD` |
| `YapSubnameRegistrar` | `0xF5F99bd86b00ad32D16E1Ae97Dd4aaa7AdeD5c8C` |
| `AbilityEscrow` | `0x18563e7E015c9e5742485E47698E067FAff279e6` |
| `YapInbox` | `0xe92dB21A770c32a19795556C46D5c6a274955DBD` |

Testnet TEE signer: `0x83df4B8EbA7c0B3B740019b8c9a77ffF77D508cF` for
provider `0xa48f01287233509FD694a22Bf840225062E67836`.

## Source

Solidity sources, deployment scripts, and full test suite live under
[`contracts/`](https://github.com/tamaa13/yap/tree/main/contracts) in
the repo. Built with Foundry, `--evm-version cancun`. **287 unit tests
passing on the v3 cascade**, slither 0 high findings.

### Verification

Both networks verified via `scripts/verify-all.py --network <mainnet|testnet>`.
Mainnet 9/9 verified on `chainscan.0g.ai`. (YapInbox same-address as
testnet via CREATE2 — already verified there.)
