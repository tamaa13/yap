# Yap Contracts

Foundry project for the Yap AI combat arena on 0G:

| Contract | Purpose |
|---|---|
| `YapFighter.sol` | ERC-7857 INFT — each token is an AI fighter; encrypted weights live off-chain (0G Storage/IPFS). Transfers require a re-sealing proof attested by the `verifier`. |
| `BattleEscrow.sol` | Betting pool + pro-rata payout for 1v1 battles. TEE oracle submits the signed verdict; settles after a 24h dispute window. |
| `BattleRegistry.sol` | Match history + ELO (K=32) tracking. Mutations gated to the escrow. |
| `YapMarketplace.sol` | Secondary market for YapFighter tokens. Fixed-price listings, pull payments for sellers + treasury, 2.5% platform fee (cap 10%), pausable. Reused by `MomentMarketplace` (separate instance, identical code). |
| `RentalEscrow.sol` | Open-market rental escrow (custody-based). Owners deposit a fighter with a price-per-day; any wallet rents for N days; escrow is the token owner during a listing and calls `YapFighter.authorizeUsage` on the renter so the canonical authorization reflects the rental. 2.5% platform fee, pausable. |
| `FighterTrainer.sol` | Append-only on-chain training timeline; emits `FighterTrained` per session. |
| `YapInbox.sol` | Singleton CREATE2 inbox for cross-agent messaging. |
| `MomentINFT.sol` | ERC-7857 collectible for outstanding battle rounds — sibling of YapFighter. Mint gated by `BattleEscrow.Settled` + caller-owns-side; (battleId, roundNo, side) uniqueness; clones inherit provenance. |
| `YapSubnameRegistrar.sol` | Permissionless `<label>.yap.0g` registrar. Standalone phase 1 (label↔tokenId, no SidRegistry); SPACE ID integration is phase 2. |

## Galileo testnet deployments

| Contract | Address |
|---|---|
| `YapFighter` | `0xD023b0C5B0CcC829DBF0B39Df5E81aECe4d36A24` |
| `FighterTrainer` | `0xC10bd77cdA8300877898612B00608bA522d5a460` |
| `BattleEscrow` | `0x4bd214FdFE925124c9e145E577Ac860C0D93Fb2e` |
| `BattleRegistry` | `0x755ef230d456b6cc991ccfff38ec5c6b0133d37b` |
| `YapMarketplace` | `0x076e42a64e4ba43700ebb0830086138468dfa275` |
| `RentalEscrow` | `0xe5Df2d51ef75A268daAd122038D94cEA9c3111EA` |
| `YapInbox` (CREATE2) | `0xe92dB21A770c32a19795556C46D5c6a274955DBD` |
| `MomentINFT` (CREATE2) | `0xf6cadAb5276A16b7C8213CD7B6BBB547f55be4AC` |
| `MomentMarketplace` (CREATE2) | `0x18653aa16a4ffc7093be0270ab427688dfd2fb81` |
| `YapSubnameRegistrar` (CREATE2) | `0xb84c024c3456b7c82ad8a08bf4b7c69804bbd56f` |

## Toolchain

- Foundry (forge 1.5+)
- Solidity `0.8.24` compiler, pragma `^0.8.19`
- **EVM target: `cancun`** (required by `foundry.toml` for 0G Aristotle)
- OpenZeppelin Contracts `v5.6.1`

## Install

```bash
cd contracts
forge install            # pulls forge-std + openzeppelin-contracts via lib/
forge build
forge test
```

Hitting the wrong `forge`? Foundry's binary lives at `~/.foundry/bin/forge` and may be shadowed by Laravel Forge (PHP) on machines with Herd installed:

```bash
export PATH="$HOME/.foundry/bin:$PATH"
```

## Test

```bash
forge test -vv
```

235 unit tests across all contracts; full suite runs in <1s. Fork tests (`*ForkE2E`) require `--fork-url https://evmrpc-testnet.0g.ai`.

## Deploy

Set env vars (exported, or keep them in a root `.env`):

```bash
export PRIVATE_KEY=0x…                       # deployer key — DO NOT commit
export ZG_TESTNET_RPC=https://evmrpc-testnet.0g.ai
export ZG_MAINNET_RPC=https://evmrpc.0g.ai   # chainId 16661
# Optional overrides (all default to the deployer address):
export YAP_ADMIN=0x…
export YAP_TREASURY=0x…
export YAP_VERIFIER=0x…
export YAP_TEE_ORACLE=0x…
export YAP_MINT_FEE=0                        # wei
```

Deploy to 0G Galileo testnet (chainId 16602):

```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url zg_testnet \
  --broadcast \
  --evm-version cancun
```

Deploy to 0G Aristotle mainnet (chainId 16661):

```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url zg_mainnet \
  --broadcast \
  --evm-version cancun
```

The script prints all four addresses + the wired roles. It automatically calls `escrow.setRegistry(registry)` so the escrow finalizes battles in the registry on settle, and constructs the marketplace against the freshly-deployed `YapFighter`.

### Deploy just the marketplace against existing YapFighter

Use this when the other core contracts are already live and only `YapMarketplace` needs to be broadcast:

```bash
export YAP_FIGHTER=0xD023b0C5B0CcC829DBF0B39Df5E81aECe4d36A24
forge script script/DeployMarketplace.s.sol:DeployMarketplace \
  --rpc-url zg_testnet \
  --broadcast \
  --evm-version cancun
```

### Deploy just the rental escrow against existing YapFighter

```bash
export YAP_FIGHTER=0xD023b0C5B0CcC829DBF0B39Df5E81aECe4d36A24
forge script script/DeployRentalEscrow.s.sol:DeployRentalEscrow \
  --rpc-url zg_testnet \
  --broadcast \
  --evm-version cancun
```

### Deploy MomentINFT (CREATE2)

```bash
export YAP_FIGHTER=0xD023b0C5B0CcC829DBF0B39Df5E81aECe4d36A24
export YAP_BATTLE_ESCROW=0x4bd214FdFE925124c9e145E577Ac860C0D93Fb2e
# optional:
# export YAP_MOMENT_MINT_FEE=0
forge script script/DeployMomentINFT.s.sol:DeployMomentINFT \
  --rpc-url zg_testnet \
  --broadcast \
  --evm-version cancun
```

### Deploy MomentMarketplace (CREATE2, second YapMarketplace instance)

```bash
export YAP_MOMENT_INFT=<MomentINFT address from above>
forge script script/DeployMomentMarketplace.s.sol:DeployMomentMarketplace \
  --rpc-url zg_testnet \
  --broadcast \
  --evm-version cancun
```

### Deploy YapSubnameRegistrar (CREATE2)

```bash
export YAP_FIGHTER=0xD023b0C5B0CcC829DBF0B39Df5E81aECe4d36A24
forge script script/DeployYapSubnameRegistrar.s.sol:DeployYapSubnameRegistrar \
  --rpc-url zg_testnet \
  --broadcast \
  --evm-version cancun
```

## ABI artifacts

After `forge build`, artifacts live at:

```
out/YapFighter.sol/YapFighter.json
out/BattleEscrow.sol/BattleEscrow.json
out/BattleRegistry.sol/BattleRegistry.json
out/YapMarketplace.sol/YapMarketplace.json
out/RentalEscrow.sol/RentalEscrow.json
out/FighterTrainer.sol/FighterTrainer.json
out/YapInbox.sol/YapInbox.json
out/MomentINFT.sol/MomentINFT.json
out/YapSubnameRegistrar.sol/YapSubnameRegistrar.json
```

Each JSON includes the ABI (for `viem`/`wagmi` on the web side), bytecode, deployed bytecode, and source map.

## Architecture notes

### YapFighter (ERC-7857)

- `mint(to, encryptedURI, metadataHash, sealedKey)` — `MINTER_ROLE`, payable when `mintFee > 0`.
- `iTransferFrom(from, to, tokenId, proofs[])` — last proof in the array must have been attested by `verifier` within the last hour (`PROOF_VALIDITY = 1 hour`). Updates `metadataHash` and `sealedKey` with the new-owner-sealed values from the proof. Clears all authorizations.
- `iCloneFrom(to, tokenId, proof)` — same proof gate; mints a new token with the cloned metadata/sealedKey.
- `authorizeUsage(tokenId, executor, permissions)` / `revokeAuthorization(tokenId, executor)` — token-owner only, capped at `MAX_EXECUTORS = 100` per token.
- `attestProof(proofId)` — `verifier`-only, marks a proof fresh. `proofId = keccak256(abi.encode(oracleType, dataHash, nonce, proof))`.

Events: `Minted`, `Transferred`, `Cloned`, `UsageAuthorized`, `UsageRevoked`, `PublishedSealedKey`.

### BattleEscrow

- `createBattle(fighterA, fighterB, topic, maxRounds)` → `battleId` (status = `Live`). Also calls `registry.registerBattle` if wired.
- `placeBet(battleId, side, amount)` payable — side 0 = A, 1 = B. One side only per bettor.
- `submitVerdict(battleId, winner, teeSig)` — `TEE_ORACLE_ROLE` only; sets status to `Verdict` and starts 24h dispute window.
- `settle(battleId)` — anyone, after the dispute window. Takes 2.5% platform fee on non-draw, non-single-side outcomes and transfers to `treasury`. Calls `registry.finalizeBattle` if wired.
- `claimPayout(battleId)` — pull pattern (reentrancy-guarded). Winners get `(bet / winnerPool) * netPool`. Draws and cancelled battles refund stakes 1:1.
- `cancel(battleId)` — anyone, after `BATTLE_TIMEOUT = 48h` with no verdict. Refunds via `claimPayout`.

### BattleRegistry

- `ESCROW_ROLE` — granted at construction; controls `registerBattle` / `recordRound` / `finalizeBattle`.
- ELO: `K = 32`, `DEFAULT_ELO = 1200`. Expected-score table sampled every 100 Elo with linear interpolation (good for demo).
- `battleHistory(tokenId, offset, limit)` — paginated.

### YapMarketplace

- `listItem(tokenId, price)` — seller must (a) own the token and (b) have approved the marketplace via `approve(marketplace, tokenId)` or `setApprovalForAll(marketplace, true)`. Paused-check enforced.
- `buyItem(tokenId)` payable — `msg.value >= price`, buyer ≠ seller; excess is refunded immediately, `sellerAmt` and `platformFee` are credited to pull balances (both via `sellerBalances`), then `safeTransferFrom` runs last (fails loudly if seller revoked approval). `nonReentrant`.
- `cancelListing(tokenId)` / `updatePrice(tokenId, newPrice)` — seller-only.
- `withdrawProceeds()` — pull; zeroes balance before the `.call{value:}`. Works for sellers **and** treasury (treasury's fees accrue into its own `sellerBalances` slot).
- `isListed(tokenId)` — returns false if the on-chain owner is no longer the recorded seller (off-market transfer drift). Downstream indexers should treat this as "effectively delisted" and call `cancelListing` to tidy the array if the seller is cooperative.
- `activeListings(offset, limit)` — paginated; `limit ≤ 100`. Removal uses swap-pop, so ordering is not insertion-order after the first cancel/buy (documented — index into `activeTokenIds` instead if you need stable ordering).
- Admin: `setPlatformFeeBps(bps)` (cap `MAX_FEE_BPS = 1000` = 10%), `setTreasury`, `pause`/`unpause`.

Gas estimates (from `forge test --match-contract YapMarketplaceTest`, warm caches):

| Function | Gas |
|---|---|
| `listItem` (first listing by seller) | ~165k |
| `buyItem` (single fill) | ~225k |
| `cancelListing` | ~50k |
| `updatePrice` | ~30k |
| `withdrawProceeds` | ~35k |

### RentalEscrow (Pattern A — custody)

- **Why custody**: escrow becomes the NFT owner for the duration of the listing, so it can call `YapFighter.authorizeUsage` (owner-only) and the canonical `authorizations[tokenId][renter]` mapping reflects the active rental. Battle and inference code only needs to read YapFighter — no sidecar registry to trust. It also makes owner-mid-rental resale physically impossible.
- **Flow**:
  1. Owner `approve(escrow, tokenId)` then `listForRent(tokenId, pricePerDay, maxDays)` — escrow pulls the NFT via `safeTransferFrom`.
  2. Any wallet calls `rent(tokenId, durationDays)` payable; escrow authorizes the renter on YapFighter with `rentalPermissions` (`0x01` default, admin-configurable), credits `sellerBalances[owner]` and `sellerBalances[treasury]`, refunds excess.
  3. After `expiresAt`, anyone can call `reclaim(tokenId)` — escrow revokes the renter's authorization and returns the NFT to the listing owner.
  4. Owner can also call `cancelRentListing(tokenId)` if no rental is currently active.
- `effectiveUser(tokenId)`: active renter during the rental window; otherwise the listing owner (while escrowed); otherwise `YapFighter.ownerOf(tokenId)`.
- Re-renting before `reclaim`: if the prior rental expired but no one has reclaimed yet, a fresh renter can call `rent` and the prior authorization is auto-revoked (executor count stays at 1).
- Gas estimates (warm caches):

| Function | Gas |
|---|---|
| `listForRent` | ~255k (includes ERC-721 safe transfer in) |
| `rent` (first fill) | ~230k |
| `rent` (subsequent, re-authorize) | ~245k |
| `reclaim` | ~160k |
| `cancelRentListing` | ~150k |
| `withdrawProceeds` | ~35k |

**Integration gotchas:**
1. **NFT custody visible in UI**: during a rental listing the fighter's `ownerOf` is `RentalEscrow`. The Vault UI should add a "Out for Rent" bucket keyed off `RentalEscrow.activeRentals` rather than `fighter.ownerOf == you`. The listing owner stays recoverable via `rentListings[tokenId].owner`.
2. **Rental listing and sale listing are mutually exclusive**: while an NFT is in `RentalEscrow`, it can't also be in `YapMarketplace` (marketplace would revert on `NotOwner`). This is the right product behavior — a fighter is either for sale, for rent, or neither — surface it as a tab choice in the UI.
3. **`effectiveUser` vs canonical YapFighter authorization**: they're redundant by design but in different directions. During a rental, both `RentalEscrow.effectiveUser` and `YapFighter.isExecutor(tokenId, renter)` return truthy for the renter. Prefer `isExecutor` for in-contract checks (e.g., BattleEscrow), prefer `effectiveUser` for UI display since it collapses the owner/renter/stray-owner cases into one address.
4. **Executor cap not hit**: re-rent path explicitly revokes the prior renter, so `YapFighter.executorCount(tokenId)` stays at 1 throughout a listing's lifetime.

### MomentINFT (ERC-7857 sibling of YapFighter)

- `mintMoment(battleId, roundNo, side, encryptedTranscriptURI, metadataHash, sealedKey, provenanceHash)` — public, payable when `mintFee > 0`. Reverts unless `BattleEscrow.getBattle(battleId).status == Settled`, `roundNo ∈ [1, maxRounds]`, `side ∈ {0,1}`, and the caller is the owner or active executor of the side's fighter on YapFighter. The `(battleId, roundNo, side)` triple is single-use — collectible serial numbers are produced via `iCloneFrom`.
- `iTransferFrom` / `iCloneFrom` — same sealed-key + bound-proofId mechanics as YapFighter; clones inherit the parent's `momentOf` provenance verbatim (same battle/round/side, new tokenId).
- `mint(...)` (IERC7857) — disabled, reverts with `MintNotSupported`. Use `mintMoment`.
- `momentOf(tokenId)` returns `(battleId, fighterTokenId, provenanceHash, roundNo, side)`. `provenanceHash` is opaque on-chain; indexers use it to rank "canonical" / "highest reaction" moments off-chain.
- `isMomentClaimed(battleId, roundNo, side)` — uniqueness check.
- Tradeable through a separate `YapMarketplace` instance whose `fighterContract` is the MomentINFT — see `script/DeployMomentMarketplace.s.sol`.

### YapSubnameRegistrar (`<label>.yap.0g`)

- `register(label, tokenId)` payable — caller must own the fighter; label `[a-z0-9-]{3,32}`, no leading/trailing hyphen; one label per tokenId, one tokenId per label. Optional `registerFee` (default 0, admin-configurable).
- `release(tokenId)` — current fighter owner releases their label so it (and the tokenId) can be re-registered.
- Resolution views: `tokenIdOf(label) → uint256` (forward, 0 = unregistered); `labelOf(tokenId) → string` (reverse, empty = unregistered); `effectiveOwner(label) → address` (lazy walk through `fighter.ownerOf` so the canonical wallet follows the NFT — no callback needed); `isAvailable(label) → bool` (well-formedness + uniqueness, never reverts).
- Bulk resolvers for UI multicall: `resolveBatch(uint256[] tokenIds) → string[]` and `resolveLabelsBatch(string[]) → uint256[]`.
- Phase 1 is standalone — there is no SidRegistry write here. Phase 2 will publish into the SANN `yap.0g` node once that domain is registered with SPACE ID; the on-chain shape (tokenId binding) stays the same.

## Roles summary

| Role | Held by (default) | Powers |
|---|---|---|
| `YapFighter.DEFAULT_ADMIN_ROLE` / `ADMIN_ROLE` | `admin` | grant/revoke roles; set verifier/treasury/mintFee |
| `YapFighter.MINTER_ROLE` | `admin` | mint new fighters |
| `YapFighter.OPERATOR_ROLE` | `admin` | call `iTransferFrom`/`iCloneFrom` on any token (gasless flows) |
| `BattleEscrow.ADMIN_ROLE` | `admin` | set registry/treasury |
| `BattleEscrow.TEE_ORACLE_ROLE` | `teeOracle` | submit verdicts |
| `BattleRegistry.ESCROW_ROLE` | `escrow` | mutate match history + stats |
| `YapMarketplace.DEFAULT_ADMIN_ROLE` / `ADMIN_ROLE` | `admin` | pause/unpause, set fee, set treasury |
| `RentalEscrow.DEFAULT_ADMIN_ROLE` / `ADMIN_ROLE` | `admin` | pause/unpause, set fee, set treasury, set default rental permissions |
| `MomentINFT.DEFAULT_ADMIN_ROLE` / `ADMIN_ROLE` | `admin` | set verifier/treasury/mintFee |
| `YapSubnameRegistrar.DEFAULT_ADMIN_ROLE` / `ADMIN_ROLE` | `admin` | set registerFee, set treasury |
