# Deployed contracts

Yap runs on **0G mainnet — Aristotle** (chainId `16661`).

## Mainnet (Aristotle, 16661)

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

9 contracts deployed and verified on `chainscan.0g.ai` (v4 cascade, 2026-05-13).

### TEE provider (mainnet)

| Field | Value |
|---|---|
| Model | `qwen3.6-plus` (1M context, roleplay-tuned, non-thinking) |
| Compute provider | `0x992e6396157Dc4f22E74F2231235D7DE62696db5` |
| `oracleKey` (TEE signer) | `0xd45b4301940B297F76d6e622c1CeA2AE660617d4` |
| `scoreOracleKey` (mint-time persona scoring) | `0xd45b4301940B297F76d6e622c1CeA2AE660617d4` |
| Architecture | Separated-centralized (TeeTLS routing-proof) |
| Provider endpoint | `compute-network-18.integratenetwork.work` |

Same TEE signer attests both battle verdicts AND mint-time persona scores — one trust assumption, two callsites.

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
- Note: `battleDAEpoch[1]` = 0 — DASigners precompile not active on Aristotle yet; contract's low-level-staticcall fallback recorded zero gracefully without blocking settlement.

## Source

Solidity sources, deployment scripts, and full test suite live under [`contracts/`](https://github.com/tamaa13/yap/tree/main/contracts). Built with Foundry, `--evm-version cancun`. Full forge unit + fork-E2E test suite passing on the v4 cascade, slither 0 high findings.

### Verification

Verified via `scripts/verify-all.py --network mainnet`. All 9 mainnet contracts source-verified on `chainscan.0g.ai`.
