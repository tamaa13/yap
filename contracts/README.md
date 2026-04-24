# Yap Contracts

Foundry project for the Yap AI combat arena on 0G. Four contracts:

| Contract | Purpose |
|---|---|
| `YapFighter.sol` | ERC-7857 INFT — each token is an AI fighter; encrypted weights live off-chain (0G Storage/IPFS). Transfers require a re-sealing proof attested by the `verifier`. |
| `BattleEscrow.sol` | Betting pool + pro-rata payout for 1v1 battles. TEE oracle submits the signed verdict; settles after a 24h dispute window. |
| `BattleRegistry.sol` | Match history + ELO (K=32) tracking. Mutations gated to the escrow. |
| `YapMarketplace.sol` | Secondary market for YapFighter tokens. Fixed-price listings, pull payments for sellers + treasury, 2.5% platform fee (cap 10%), pausable. |
| `RentalEscrow.sol` | Open-market rental escrow (custody-based). Owners deposit a fighter with a price-per-day; any wallet rents for N days; escrow is the token owner during a listing and calls `YapFighter.authorizeUsage` on the renter so the canonical authorization reflects the rental. 2.5% platform fee, pausable. |

## Galileo testnet deployments

| Contract | Address |
|---|---|
| `YapFighter` | `0xeDc375D18fC3997E8E38BC98aB1Cd6A9Fe6db35B` |
| `BattleEscrow` | `0xAa019127eE3Fab9adB86aAEE85923533f4f2399E` |
| `BattleRegistry` | `0x2c5512CCe2bDcE034b22C956245fdd43D6E4195D` |
| `YapMarketplace` | `0x4725b40B391d81E82CE715F901B85989eBb5873A` |
| `RentalEscrow` | _broadcast pending_ |

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

110 tests across the five contracts; full suite runs in <1s.

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
export YAP_FIGHTER=0xeDc375D18fC3997E8E38BC98aB1Cd6A9Fe6db35B
forge script script/DeployMarketplace.s.sol:DeployMarketplace \
  --rpc-url zg_testnet \
  --broadcast \
  --evm-version cancun
```

### Deploy just the rental escrow against existing YapFighter

```bash
export YAP_FIGHTER=0xeDc375D18fC3997E8E38BC98aB1Cd6A9Fe6db35B
forge script script/DeployRentalEscrow.s.sol:DeployRentalEscrow \
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
