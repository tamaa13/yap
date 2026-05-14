# V2 redeploy ceremony — Strategy A (full cascade)

> **Historical context (post-shipped note)**: This document describes
> the **testnet** V2 redeploy on 2026-05-11. The v4 cascade was later
> deployed to **0G Aristotle mainnet (chainId 16661)** on 2026-05-13
> — see `contracts/README.md` for the canonical mainnet address
> table. This runbook is retained as a record of the ceremony pattern.

The Phase-3 audit pass (commits `7a68798` through `9a87d81`) changed
the bytecode of every contract that holds a YapFighter pointer as an
`immutable`. Per PM decision on 2026-05-11, we drop the existing
testnet artifacts and redeploy the full cascade with a new salt set.

This doc is the runbook. The orchestration is in
`contracts/script/DeployV2Ceremony.s.sol`; this file documents the
pre-flight, the commands, and the post-deploy checklist.

## What gets redeployed

| Step | Contract | Salt | Notes |
|---:|---|---|---|
| 1 | YapFighter | `keccak256("yap:YapFighter:v2")` | +chainid in proof, +PersonaAccessed log |
| 2 | BattleEscrow | `keccak256("yap:BattleEscrow:v2")` | +DA epoch anchoring |
| 3 | YapMarketplace (fighter) | `keccak256("yap:YapMarketplace:v2")` | +EIP-2981 royalty hook |
| 4 | RentalEscrow | `keccak256("yap:RentalEscrow:v2")` | no code change — new fighter pointer |
| 5 | YapSubnameRegistrar | `keccak256("yap:YapSubnameRegistrar:v2")` | no code change — new fighter pointer |
| 6 | MomentINFT | `keccak256("yap:MomentINFT:v2")` | +royalty surface, +chainid, new escrow + fighter |
| 7 | MomentMarketplace | `keccak256("yap:MomentMarketplace:v2")` | second YapMarketplace instance, pointed at MomentINFT |
| 8 | BattleRegistry | _(no redeploy)_ | `setEscrow(v2)` role rotation only |

## Pre-flight

1. **Tests + slither clean** on the commit you're deploying:
   ```sh
   cd contracts
   PATH="$HOME/.foundry/bin:$PATH" forge test --no-match-path 'test/*ForkE2E*'
   PATH="$HOME/.foundry/bin:$PATH" slither . \
     --filter-paths "lib|test|node_modules|script" \
     --exclude-dependencies --exclude-informational --exclude-low --exclude-medium
   ```
   Both must report ok / 0 results.

2. **Foundry binary first in PATH.** The user's Laravel Forge wrapper
   hijacks `forge` on macOS. Prepend `~/.foundry/bin` for the entire
   session, or hardcode `~/.foundry/bin/forge` in commands.

3. **Broker balance.** Each cascade pass costs ≲0.05 OG total on
   Galileo. Confirm `ZG_BROKER_KEY` has ≥0.5 OG before starting:
   ```sh
   ~/.foundry/bin/cast balance --rpc-url $ZG_TESTNET_RPC \
     $(~/.foundry/bin/cast wallet address --private-key $ZG_BROKER_KEY)
   ```

4. **Deployer == registry admin.** The script calls
   `BattleRegistry.setEscrow(newEscrow)`, which requires the deployer
   to hold `ADMIN_ROLE` on the existing registry at
   `0x755ef230d456b6cc991ccfff38ec5c6b0133d37b`. Verify:
   ```sh
   ~/.foundry/bin/cast call --rpc-url $ZG_TESTNET_RPC \
     0x755ef230d456b6cc991ccfff38ec5c6b0133d37b \
     "hasRole(bytes32,address)(bool)" \
     0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775 \
     $(~/.foundry/bin/cast wallet address --private-key $ZG_BROKER_KEY)
   ```
   Expect `true`. (The role hash is `keccak256("ADMIN_ROLE")`.)

5. **TEE signer still valid.** The new BattleEscrow takes the oracle
   key at constructor time. Pin it to the live TEE signer of the
   pinned 0G Compute provider:
   ```sh
   pnpm --filter web tsx scripts/query-tee-signer.ts
   # Expected: 0x83df4B8EbA7c0B3B740019b8c9a77ffF77D508cF for provider
   # 0xa48f01287233509FD694a22Bf840225062E67836
   ```

## Run

Galileo testnet:

```sh
cd contracts
export PRIVATE_KEY=$ZG_BROKER_KEY
export YAP_BATTLE_REGISTRY_V1=0x755ef230d456b6cc991ccfff38ec5c6b0133d37b
export YAP_TEE_ORACLE=0x83df4B8EbA7c0B3B740019b8c9a77ffF77D508cF
# YAP_ADMIN / YAP_TREASURY / YAP_VERIFIER fall back to deployer if unset.
# YAP_MINT_FEE / YAP_MOMENT_MINT_FEE fall back to 0 if unset.

~/.foundry/bin/forge script script/DeployV2Ceremony.s.sol:DeployV2Ceremony \
  --rpc-url zg_testnet \
  --broadcast \
  --legacy --priority-gas-price 2000000000 \
  --evm-version cancun
```

The `--legacy --priority-gas-price 2000000000` flags are required —
Galileo's chain enforces a 2 gwei minimum priority fee that Foundry
auto-pricing undershoots. Without them every tx aborts with
`gas price below minimum`.

The script logs every deployed address inline (`[1/8]` through `[8/8]`)
and ends with a summary block ready to paste into `apps/web/.env.local`.

## Optional revoke of v1 escrow role

`BattleRegistry.setEscrow` _grants_ ESCROW_ROLE to the new escrow but
does not revoke it from v1. Dormant contracts still hold the role.
To revoke as part of the same ceremony:

```sh
export REVOKE_V1_ESCROW_ROLE=true
export YAP_BATTLE_ESCROW_V1=0x4bd214fdfe925124c9e145e577ac860c0d93fb2e
```

Add these to your env before running the script. The ceremony's
broadcast block already covers `revokeRole(ESCROW_ROLE, v1)`.

## Mainnet — same script, different RPC

The same salts + the same deployer + the same constructor args reach
the same CREATE2 addresses on Aristotle. Once Galileo smoke-tests
pass and 0G Bug #6 (broker TLS cert validation) clears upstream,
re-run with `--rpc-url zg_mainnet`. No script changes required.

## Post-deploy

1. **Sync ABIs** to the web app:
   ```sh
   pnpm contracts:abi
   ```
   This regenerates `apps/web/lib/abi/*.json` from the freshly compiled
   contracts. yap-web pulls the new event signatures (BattleDAAnchored,
   RoyaltySet, RoyaltyPaid, PersonaAccessed) automatically.

2. **Update `apps/web/.env.local`** — replace every
   `NEXT_PUBLIC_*_ADDR_TESTNET` with the new address (paste from the
   script's `=== v2 cascade complete ===` summary block).

3. **Push to VPS** so the deployed Vercel/pm2 environment matches:
   ```sh
   scp apps/web/.env.local yap-vps:/home/yap-service/yap/apps/web/.env.local
   ssh yap-vps "cd /home/yap-service/yap && pnpm --filter web build && pm2 restart yap"
   ```

4. **Verify on chainscan** via the existing automation:
   ```sh
   cd contracts
   # Regenerate verify/<name>/standard-json-input.json for each redeployed contract
   # (the existing ones were captured against v1 bytecode):
   for c in YapFighter BattleEscrow YapMarketplace RentalEscrow YapSubnameRegistrar MomentINFT; do
     mkdir -p verify/$c
     ~/.foundry/bin/forge verify-contract \
       --chain-id 16602 \
       --show-standard-json-input \
       "$(jq -r .<addr-from-summary> <some-source>)" \
       src/$c.sol:$c \
       | python3 -c "import sys; raw=sys.stdin.buffer.read(); print(raw[raw.find(b'{'):].decode())" \
       > verify/$c/standard-json-input.json
   done
   python3 scripts/verify-all.py
   ```
   (For MomentMarketplace, reuse `verify/YapMarketplace/` — same source,
   different constructor args — per the existing script's caveat note.)

5. **Update `docs/contracts.md`** address table with the v2 row set.

6. **Update `docs/SUBMISSION.md`** deployment table likewise.

7. **Smoke-test checklist** — exercise each new code path against the
   live deployment so the redeploy is validated, not just live:

   | Path | How |
   |---|---|
   | DA epoch anchoring | Settle a fresh battle on v2 escrow → `cast call escrow battleDAEpoch(uint256)(uint256) <battleId>` returns non-zero |
   | Royalty on Moment | Mint a moment → list → buy from a different address → `cast call momentMarket sellerProceeds(address)(uint256) <minter>` shows royalty credit |
   | Cross-chain proof binding | Existing transfer test path — proof attest + iTransferFrom round-trip — should still work end-to-end |
   | PersonaAccessed log | `cast send fighter logAccess(uint256,uint256) <tokenId> <battleId> --from <owner>` → check `cast call fighter getAccessCount(uint256)(uint256) <tokenId>` incremented + look up the log |
   | Subname lazy resolve | Register a label, transfer the fighter, re-resolve → `effectiveOwner` returns the new owner |
   | Rental dispute split | Existing RentalEscrow flow — the asymmetric fee at line 461 still applies (P-3 audit confirmed; no code change in this cascade) |

## Smoke-test address template

Fill in after the ceremony runs:

```
YAP_FIGHTER_V2          0x________________________________________
BATTLE_ESCROW_V2        0x________________________________________
BATTLE_REGISTRY         0x755ef230d456b6cc991ccfff38ec5c6b0133d37b  (unchanged)
YAP_MARKETPLACE_V2      0x________________________________________
RENTAL_ESCROW_V2        0x________________________________________
YAP_SUBNAME_V2          0x________________________________________
MOMENT_INFT_V2          0x________________________________________
MOMENT_MARKET_V2        0x________________________________________
```

## Rollback plan

CREATE2 deployments are not reversible — if the ceremony lands but a
smoke-test reveals a regression, the rollback is to redeploy at a
fresh salt (`v3` etc.) with the fix. The v1 contracts are still on
chain at their original addresses but no UI surface routes through
them; the cost of "rolling back" is ABI/env swap only, not a chain
operation.
