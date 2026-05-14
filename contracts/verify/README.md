# Contract verification — Aristotle mainnet + Galileo testnet

**Mainnet (Aristotle, chainId 16661)** — 9 contracts verified on
`https://chainscan.0g.ai` (v4 cascade deployed 2026-05-13). Addresses
in the table below.

**Testnet (Galileo, chainId 16602)** — historical record of the
testnet ceremony. The standard-json-inputs in this directory and the
automation script were used for the testnet pass.

## How verification works on chainscan-galileo

chainscan-galileo's `/open` endpoint is **Etherscan-compatible** — the
SPA's verify form POSTs to `/open/api` with
`module=contract&action=verifysourcecode`. The OpenAPI spec at
`/open/doc` documents the exact contract.

Foundry's `forge verify-contract --verifier blockscout --verifier-url
https://chainscan-galileo.0g.ai/api` does NOT work — that hits the
explorer's static SPA route, not the API. The correct path is `/open`,
not `/api`. There's no documented `--verifier-url` shortcut for this
yet, so we drive the API directly via `scripts/verify-all.py`.

## Running the automation

```bash
cd contracts
python3 scripts/verify-all.py
```

The script POSTs `module=contract&action=verifysourcecode` for each
contract, polls `checkverifystatus` until terminal, and prints a
summary. ~30 seconds total for 10 contracts.

## Compiler settings (apply to all 10)

| Field | Value |
|---|---|
| Compiler | `0.8.24` |
| EVM version | `cancun` |
| Optimizer | enabled |
| Optimizer runs | `200` |
| Via IR | `true` |
| License | `MIT` |

## Per-contract artifacts

Each subdirectory has:

* `standard-json-input.json` — full Solidity Standard JSON Input
  (sources + settings, in the format chainscan/Etherscan expects).
* `constructor-args.txt` — ABI-encoded constructor arguments
  (paste verbatim into the "Constructor Arguments" field, with or
  without the `0x` prefix as the explorer accepts).

## Deployment table — Aristotle mainnet (canonical, chainId 16661)

| Contract | Address |
|---|---|
| YapFighter | `0x3a3b176E91AE3Da4eF3a6B968E84120fC61CFd2b` |
| BattleEscrow | `0x311ecf5B66Ab569Bcb4cB96e7b4085CA2b59b037` |
| BattleRegistry | `0xda4f5279e677576831Fb5d99f2C754D5407030ee` |
| YapFighterMarket | `0xb20769dD18F1438CA0aDa66Adf9ba670Cab6b9B0` |
| RentalEscrow | `0x6b89A8E306E3E567598A6233F10D6c410da07eB8` |
| MomentINFT | `0x42C85f0EAa8Aef98c0ec1057e6c241769861A1aF` |
| MomentMarketplace | `0x0514c5F6a9b7a57d329f41125C9E84C805F3Be7c` |
| AbilityEscrow | `0x07E47975Aac222B0D82DB8b5f5A6a24Fd87C7148` |
| YapSubname | `0x4aC6E562b1b3CF9B2c0B6A3789200E889eD7576d` |

Verify via `https://chainscan.0g.ai/address/<addr>`.

## Deployment table — Galileo testnet (historical, chainId 16602)

| Contract | Address |
|---|---|
| YapFighter | `0xd023b0c5b0ccc829dbf0b39df5e81aece4d36a24` |
| BattleEscrow | `0x4bd214fdfe925124c9e145e577ac860c0d93fb2e` |
| BattleRegistry | `0x755ef230d456b6cc991ccfff38ec5c6b0133d37b` |
| YapMarketplace | `0x076e42a64e4ba43700ebb0830086138468dfa275` |
| RentalEscrow | `0xe5Df2d51ef75A268daAd122038D94cEA9c3111EA` |
| MomentINFT | `0xf6cadAb5276A16b7C8213CD7B6BBB547f55be4AC` |
| MomentMarketplace | `0x18653aa16a4ffc7093be0270ab427688dfd2fb81` |
| YapSubnameRegistrar | `0xb84c024c3456b7c82ad8a08bf4b7c69804bbd56f` |
| YapInbox | `0xe92dB21A770c32a19795556C46D5c6a274955DBD` |

**Constructor argument values (decoded for sanity-check):**

```
DEPLOYER  = 0x1d4D51F08ab86985533Da9D574A3df68336c485D
TEE_ORACLE= 0x83df4B8EbA7c0B3B740019b8c9a77ffF77D508cF  (provider TEE signer)
FIGHTER   = 0xD023b0C5B0CcC829DBF0B39Df5E81aECe4d36A24
ESCROW    = 0x4bd214FdFE925124c9e145E577Ac860C0D93Fb2e
MOMENT    = 0xf6cadAb5276A16b7C8213CD7B6BBB547f55be4AC
```

| Contract | Constructor signature | Args (decoded) |
|---|---|---|
| YapFighter | `(address admin, address verifier, address treasury, uint256 mintFee)` | DEPLOYER, DEPLOYER, DEPLOYER, 0 |
| BattleEscrow | `(address admin, address treasury, address oracleKey, address fighter)` | DEPLOYER, DEPLOYER, TEE_ORACLE, FIGHTER |
| BattleRegistry | `(address admin, address battleEscrow)` | DEPLOYER, ESCROW |
| YapMarketplace | `(address fighter, address admin, address treasury)` | FIGHTER, DEPLOYER, DEPLOYER |
| RentalEscrow | `(address fighter, address admin, address treasury)` | FIGHTER, DEPLOYER, DEPLOYER |
| FighterTrainer | `(address fighter)` | FIGHTER |
| MomentINFT | `(address admin, address verifier, address treasury, address escrow, address fighter, uint256 mintFee)` | DEPLOYER, DEPLOYER, DEPLOYER, ESCROW, FIGHTER, 0 |
| MomentMarketplace | `(address nft, address admin, address treasury)` | MOMENT, DEPLOYER, DEPLOYER |
| YapSubnameRegistrar | `(address fighter, address admin, address treasury)` | FIGHTER, DEPLOYER, DEPLOYER |
| YapInbox | `()` *(no args)* | — |

## Manual verification flow on chainscan-galileo

For each contract:

1. Navigate to the address page on chainscan-galileo:
   `https://chainscan-galileo.0g.ai/address/<address>`
2. Click **Verify Contract** (or **Verify and Publish**) — exact
   button label may differ; route is typically `/verifyContract`.
3. Choose **Standard JSON Input** as the verification method
   (preferred over single-file flatten — preserves all imports
   exactly as compiled).
4. Paste contents of `verify/<ContractName>/standard-json-input.json`
   into the source textarea.
5. Set compiler version: `0.8.24+commit.<...>` (pick from the
   dropdown — 0.8.24 only).
6. Set EVM version: `cancun`.
7. Optimizer: enabled, 200 runs.
8. Constructor arguments: paste contents of
   `verify/<ContractName>/constructor-args.txt` (omit if YapInbox).
9. License: `MIT`.
10. Submit.

If the explorer rejects with a bytecode mismatch, two common causes:

- Wrong compiler patch version. Try the latest `0.8.24+commit.*`
  available; Foundry's pinned version should match.
- Missing `via_ir: true`. Some explorers don't expose this toggle —
  the Standard JSON Input encodes it inside the file, but if the
  explorer sniffs settings out manually, paste the corresponding
  setting from the JSON.

## Troubleshooting

* **"Bytecode does not match"**: the JSON includes immutable args
  in the runtime bytecode. Make sure the address you're verifying
  matches what's in the deployment table. Constructor args MUST
  match the on-chain deployment exactly.
* **"Compiler not found"**: chainscan may have a small set of
  pre-cached compilers. Check what's in their dropdown — if 0.8.24
  isn't listed, escalate to 0G team.
* **UI form returns 500**: chainscan verifier may have an outage.
  Wait 15 min and retry. If persistent, ping 0G team via Discord
  or Telegram.

## Optional: ask 0G team for an API verifier

Worth pinging the 0G dev community with this exact ask:

> "Is there a programmatic contract-verification endpoint for
> chainscan-galileo? If yes, can you publish the URL + format so
> Foundry's `forge verify-contract --verifier blockscout|etherscan
> --verifier-url <X>` can target it directly?"

If they publish one, update the section at the top of this README
with the command + URL.
