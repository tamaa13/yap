#!/usr/bin/env bash
# End-to-end test of the Yap battle lifecycle — no UI required.
#
# Runs against the currently deployed testnet contracts (reads from
# .env.local) and uses two distinct wallets (server wallet + anvil test
# wallet) to simulate challenger + defender.
#
# Pipeline:
#   1. Mint Fighter A via /api/mint → user signs mint → save tokenId
#   2. Mint Fighter B (second wallet)
#   3. Fighter A challenges Fighter B (1 0G stake, 3 rounds)
#   4. Fighter B accepts with 0.75 0G stake (meets 75% min)
#   5. Trigger battle runner via POST /api/battle/[id]/start
#   6. Poll /state every 3s until phase === "settled"
#   7. After dispute window (30s), call settle() on-chain
#   8. Both wallets call claimPayout()
#   9. Verify final balances + log summary
#
# This script runs against an already-running dev server on localhost:3000.
# It exercises REAL 0G Compute inference (2 args per round + 1 judge = 7
# inference calls for a 3-round battle). Takes ~3-5 minutes.

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────

WEB_DIR="/Users/tama/projects/yap/apps/web"
CONTRACTS_DIR="/Users/tama/projects/yap/contracts"
API_BASE="http://localhost:3000"
CAST="/Users/tama/.foundry/bin/cast"

# Load env
set -a
source "$WEB_DIR/.env.local"
source "$CONTRACTS_DIR/.env"
set +a

RPC="$ZG_TESTNET_RPC"
ESC="$NEXT_PUBLIC_BATTLE_ESCROW_ADDR_TESTNET"
FIGHTER="$NEXT_PUBLIC_YAP_FIGHTER_ADDR_TESTNET"

# Wallet A = deployer (funded). Wallet B = ephemeral key generated per run
# so we always have a clean second participant with no prior state.
PK_A="$PRIVATE_KEY"
WALLET_A=$($CAST wallet address --private-key "$PK_A")

NEW_WALLET_JSON=$($CAST wallet new --json)
PK_B=$(echo "$NEW_WALLET_JSON" | jq -r '.[0].private_key')
WALLET_B=$(echo "$NEW_WALLET_JSON" | jq -r '.[0].address')

GAS_ARGS="--priority-gas-price 3000000000 --gas-price 5000000000"

# Stakes sized low — keeps testnet spend minimal across repeated runs.
STAKE_A_WEI="50000000000000000"     # 0.05  0G challenger
STAKE_B_WEI="37500000000000000"     # 0.0375 0G defender (exactly 75%)
WALLET_B_FUND_WEI="100000000000000000" # 0.1 0G — stake + gas buffer

# Retry helper — 0G testnet RPC returns transient "null response" errors.
cast_send_retry() {
  local tries=0
  while (( tries < 3 )); do
    if "$@"; then return 0; fi
    tries=$((tries + 1))
    echo "  (retry $tries/3 after RPC flake)…" >&2
    sleep 3
  done
  return 1
}

echo "═══════════════════════════════════════════════"
echo "Yap E2E test — $(date -u +%FT%TZ)"
echo "═══════════════════════════════════════════════"
echo "Escrow:   $ESC"
echo "Fighter:  $FIGHTER"
echo "Wallet A: $WALLET_A"
echo "Wallet B: $WALLET_B"
echo ""

# ─── Fund the ephemeral wallet B ─────────────────────────────────────────

BAL_A_WEI=$($CAST balance "$WALLET_A" --rpc-url "$RPC" | awk '{print $1}')
BAL_A_ETH=$(echo "scale=4; $BAL_A_WEI / 10^18" | bc -l)
echo "Wallet A balance: $BAL_A_ETH 0G"
echo "→ Funding wallet B with 0.1 0G from wallet A…"
cast_send_retry $CAST send "$WALLET_B" --value "$WALLET_B_FUND_WEI" \
  --rpc-url "$RPC" --private-key "$PK_A" $GAS_ARGS > /dev/null
echo "  ↳ funded"

# ─── Step 1+2: mint two fighters ────────────────────────────────────────

mint_fighter() {
  local owner="$1"
  local archetype="$2"
  local seed="$3"
  local label="$4"

  echo "→ [$label] requesting /api/mint prepare…"
  local prep
  prep=$(curl -s -X POST "$API_BASE/api/mint" \
    -H "content-type: application/json" \
    -d "$(jq -n --arg o "$owner" --arg a "$archetype" --arg s "$seed" \
      '{owner:$o, archetype:$a, styleSeed:$s}')")

  local to
  local encryptedURI
  local metadataHash
  local sealedKey
  to=$(echo "$prep" | jq -r '.mint.to')
  encryptedURI=$(echo "$prep" | jq -r '.mint.encryptedURI')
  metadataHash=$(echo "$prep" | jq -r '.mint.metadataHash')
  sealedKey=$(echo "$prep" | jq -r '.mint.sealedKey')

  if [[ "$to" == "null" ]]; then
    echo "  prepare failed: $prep"
    return 1
  fi

  echo "  ↳ seed uploaded, metadata hash=$metadataHash"
  echo "→ [$label] signing mint() on-chain…"

  local pk
  local owner_lc
  local wa_lc
  owner_lc=$(echo "$owner" | tr '[:upper:]' '[:lower:]')
  wa_lc=$(echo "$WALLET_A" | tr '[:upper:]' '[:lower:]')
  if [[ "$owner_lc" == "$wa_lc" ]]; then pk="$PK_A"; else pk="$PK_B"; fi

  local fee
  fee=$($CAST call "$FIGHTER" "mintFee()(uint256)" --rpc-url "$RPC" | awk '{print $1}')
  local tx
  tx=$($CAST send "$FIGHTER" \
    "mint(address,string,bytes32,bytes)" \
    "$to" "$encryptedURI" "$metadataHash" "$sealedKey" \
    --value "$fee" \
    --rpc-url "$RPC" --private-key "$pk" $GAS_ARGS \
    --json | jq -r '.transactionHash')

  echo "  ↳ mint tx: $tx"

  # Commit plaintext meta to server store so runner can build persona.
  curl -s -X POST "$API_BASE/api/fighters/commit" \
    -H "content-type: application/json" \
    -d "$(jq -n \
      --arg tx "$tx" --arg owner "$owner" --arg arch "$archetype" \
      --arg seedRoot "$(echo "$prep" | jq -r '.commit.seedRoot')" \
      --arg weightsRoot "$(echo "$prep" | jq -r '.commit.weightsRoot')" \
      --argjson sig "$(echo "$prep" | jq '.commit.signatureStyle')" \
      '{txHash:$tx, owner:$owner, archetype:$arch, name:"\($arch)-agent",
        seedRoot:$seedRoot, weightsRoot:$weightsRoot, signatureStyle:$sig}'
    )" > /dev/null

  # Fetch tokenId from the Minted event.
  local block
  block=$($CAST tx "$tx" blockNumber --rpc-url "$RPC" | awk '{print $1}')
  local log
  log=$($CAST logs --from-block "$block" --to-block "$block" \
    --address "$FIGHTER" \
    "Minted(uint256,address,bytes32,string)" \
    --rpc-url "$RPC" --json | jq -c '.[0]')
  local tokenId
  tokenId=$(echo "$log" | jq -r '.topics[1]' | $CAST --to-dec)
  echo "  ↳ [$label] tokenId = $tokenId"

  echo "$tokenId"
}

SEED_A='{"prompt":"Q","completion":"A spirited case for decentralization."}
{"prompt":"Q","completion":"Control the primitives, control the future."}
{"prompt":"Q","completion":"Trustless rails win the long arc."}'

SEED_B='{"prompt":"Q","completion":"Centralized systems scale faster in practice."}
{"prompt":"Q","completion":"Users want convenience, not sovereignty."}
{"prompt":"Q","completion":"The last mile is always coordination."}'

FIGHTER_A_ID=$(mint_fighter "$WALLET_A" "debater" "$SEED_A" "A")
FIGHTER_B_ID=$(mint_fighter "$WALLET_B" "roaster" "$SEED_B" "B")

echo ""
echo "Fighters minted: A=#$FIGHTER_A_ID  B=#$FIGHTER_B_ID"
echo ""

# ─── Step 3: challenger creates battle ──────────────────────────────────

TOPIC="Is decentralization worth the friction?"

echo "→ createBattle: fighter #$FIGHTER_A_ID vs #$FIGHTER_B_ID, stake 0.1 0G, 3 rounds…"
CREATE_TX=$($CAST send "$ESC" \
  "createBattle(uint256,uint256,string,uint8)" \
  "$FIGHTER_A_ID" "$FIGHTER_B_ID" "$TOPIC" 3 \
  --value "$STAKE_A_WEI" \
  --rpc-url "$RPC" --private-key "$PK_A" $GAS_ARGS \
  --json | jq -r '.transactionHash')
echo "  ↳ create tx: $CREATE_TX"

BATTLE_ID=$($CAST call "$ESC" "nextBattleId()(uint256)" --rpc-url "$RPC" | awk '{print $1}')
echo "  ↳ battle id: $BATTLE_ID"

# ─── Step 4: defender accepts with 0.75 0G ──────────────────────────────

echo ""
echo "→ acceptBattle: wallet B stakes 0.75 0G…"
ACCEPT_TX=$($CAST send "$ESC" \
  "acceptBattle(uint256)" "$BATTLE_ID" \
  --value "$STAKE_B_WEI" \
  --rpc-url "$RPC" --private-key "$PK_B" $GAS_ARGS \
  --json | jq -r '.transactionHash')
echo "  ↳ accept tx: $ACCEPT_TX"

# ─── Step 5: start runner ───────────────────────────────────────────────

echo ""
echo "→ POST /api/battle/$BATTLE_ID/start (kicks runner)…"
curl -s -X POST "$API_BASE/api/battle/$BATTLE_ID/start" \
  -H "content-type: application/json" -d '{}' | jq '.phase'

# ─── Step 6: poll state until settled or failed ─────────────────────────

echo ""
echo "→ Polling state (every 3s)…"
START=$(date +%s)
while true; do
  BODY=$(curl -s "$API_BASE/api/battle/$BATTLE_ID/state")
  PHASE=$(echo "$BODY" | jq -r '.state.phase // "none"')
  ROUND=$(echo "$BODY" | jq -r '.state.currentRound // 0')
  echo "  [$(($(date +%s) - START))s] phase=$PHASE round=$ROUND"
  if [[ "$PHASE" == "settled" ]]; then
    echo "  ✓ settled — runner submitted verdict"
    WINNER=$(echo "$BODY" | jq -r '.state.verdict.winner')
    TX=$(echo "$BODY" | jq -r '.state.verdict.txHash')
    echo "  ↳ winner=$WINNER  verdict tx=$TX"
    break
  fi
  if [[ "$PHASE" == "failed" ]]; then
    echo "  ✗ failed:"
    echo "$BODY" | jq '.state.failure'
    exit 1
  fi
  sleep 3
  if (( $(date +%s) - START > 480 )); then
    echo "  ✗ timeout after 8 min"
    exit 1
  fi
done

# ─── Step 7: wait for dispute window + call settle ──────────────────────

WINDOW=$($CAST call "$ESC" "disputeWindow()(uint256)" --rpc-url "$RPC" | awk '{print $1}')
echo ""
echo "→ Waiting dispute window ($WINDOW s) + 5s buffer…"
sleep $((WINDOW + 5))

echo "→ settle($BATTLE_ID)…"
SETTLE_TX=$($CAST send "$ESC" \
  "settle(uint256)" "$BATTLE_ID" \
  --rpc-url "$RPC" --private-key "$PK_A" $GAS_ARGS \
  --json | jq -r '.transactionHash')
echo "  ↳ settle tx: $SETTLE_TX"

# ─── Step 8: both wallets claim ─────────────────────────────────────────

echo ""
BAL_A_BEFORE=$($CAST balance "$WALLET_A" --rpc-url "$RPC" | awk '{print $1}')
BAL_B_BEFORE=$($CAST balance "$WALLET_B" --rpc-url "$RPC" | awk '{print $1}')

echo "→ claimPayout from wallet A…"
$CAST send "$ESC" "claimPayout(uint256)" "$BATTLE_ID" \
  --rpc-url "$RPC" --private-key "$PK_A" $GAS_ARGS > /dev/null 2>&1 || \
  echo "  (wallet A claim reverted — likely NothingToClaim if lost)"

echo "→ claimPayout from wallet B…"
$CAST send "$ESC" "claimPayout(uint256)" "$BATTLE_ID" \
  --rpc-url "$RPC" --private-key "$PK_B" $GAS_ARGS > /dev/null 2>&1 || \
  echo "  (wallet B claim reverted — likely NothingToClaim if lost)"

BAL_A_AFTER=$($CAST balance "$WALLET_A" --rpc-url "$RPC" | awk '{print $1}')
BAL_B_AFTER=$($CAST balance "$WALLET_B" --rpc-url "$RPC" | awk '{print $1}')

# Deltas in 0G (wei / 1e18, rounded to 4 decimals).
DELTA_A=$(echo "scale=4; ($BAL_A_AFTER - $BAL_A_BEFORE) / 10^18" | bc -l)
DELTA_B=$(echo "scale=4; ($BAL_B_AFTER - $BAL_B_BEFORE) / 10^18" | bc -l)

echo ""
echo "═══════════════════════════════════════════════"
echo "RESULT"
echo "═══════════════════════════════════════════════"
echo "Winner:      Side $WINNER"
echo "Wallet A Δ:  $DELTA_A 0G (from claim; excludes gas)"
echo "Wallet B Δ:  $DELTA_B 0G"
echo ""
echo "Battle state snapshot:"
curl -s "$API_BASE/api/battle/$BATTLE_ID/state" | jq '{
  phase: .state.phase,
  currentRound: .state.currentRound,
  maxRounds: .state.maxRounds,
  provider: .state.provider,
  winner: .state.verdict.winner,
  reasoning: .state.verdict.reasoning,
  txHash: .state.verdict.txHash,
  reactions: .state.reactions,
  spectators: .spectators
}'
echo ""
echo "Full transcript saved at .data/battle-state.json"
echo "Done."
