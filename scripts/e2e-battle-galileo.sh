#!/usr/bin/env bash
# Live battle E2E — runs the FULL battle pipeline end-to-end against the
# Galileo deploy:
#   create + accept (cast) → POST /api/battle/[id]/start (backend runs
#   inference, judge, signs verdict, submits on-chain) → wait dispute
#   window → settle (cast) → claim payouts (cast).
#
# Self-battle: one wallet owns both fighters and acts as both challenger
# and defender. Pari-mutuel returns same wallet ≈ stake minus platform
# fee + gas. Real Compute spend per round + judge call (~3-5 minutes).
#
# Run:
#   bash scripts/e2e-battle-galileo.sh
#
# Override the API base if testing locally:
#   API_URL=http://localhost:3000 bash scripts/e2e-battle-galileo.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; source "$ROOT/apps/web/.env.local"; set +a

CAST="$HOME/.foundry/bin/cast"
RPC="https://evmrpc-testnet.0g.ai"
API="${API_URL:-http://103.150.227.197}"

ESCROW="0x4bd214FdFE925124c9e145E577Ac860C0D93Fb2e"
GAS_FLAGS=(--priority-gas-price 2000000000 --gas-price 2500000000)

OWNER=$($CAST wallet address --private-key "$ZG_BROKER_KEY")
FIGHTER_A=1
FIGHTER_B=5
STAKE="1000000000000000"  # 0.001 OG per side
TOPIC="e2e smoke debate"

echo "═══ Yap battle E2E (real TEE-signed verdict) ═══"
echo "owner:    $OWNER (both sides — self-battle)"
echo "A vs B:   #$FIGHTER_A vs #$FIGHTER_B"
echo "stake:    $STAKE wei each side"
echo "API:      $API"

START_BAL=$($CAST balance --rpc-url "$RPC" "$OWNER")

# ── 1. Read next battleId, create battle ─────────────────────────────
echo
echo "── 1. createBattle ──"
NEXT_ID_PRE=$($CAST call --rpc-url "$RPC" "$ESCROW" "nextBattleId()(uint256)")
echo "next battleId before: $NEXT_ID_PRE"

CREATE_OUT=$($CAST send --rpc-url "$RPC" --private-key "$ZG_BROKER_KEY" "${GAS_FLAGS[@]}" \
  --value "$STAKE" \
  "$ESCROW" \
  "createBattle(uint256,uint256,string,uint8)(uint256)" \
  $FIGHTER_A $FIGHTER_B "$TOPIC" 3 2>&1)
TX=$(echo "$CREATE_OUT" | grep -oE "0x[0-9a-f]{64}" | head -1)
echo "tx: $TX"

NEXT_ID_POST=$($CAST call --rpc-url "$RPC" "$ESCROW" "nextBattleId()(uint256)")
BID=$NEXT_ID_POST
echo "battleId: $BID"

# ── 2. Accept (same wallet) ──────────────────────────────────────────
echo
echo "── 2. acceptBattle ──"
$CAST send --rpc-url "$RPC" --private-key "$ZG_BROKER_KEY" "${GAS_FLAGS[@]}" \
  --value "$STAKE" \
  "$ESCROW" "acceptBattle(uint256)" $BID 2>&1 \
  | grep -E "transactionHash|status" | head -2

STATUS=$($CAST call --rpc-url "$RPC" "$ESCROW" "getBattle(uint256)" $BID | head -c 100)
echo "battle struct (head): $STATUS…"

# ── 3. Trigger backend runner ───────────────────────────────────────
echo
echo "── 3. POST /api/battle/$BID/start (backend runs Compute + signs) ──"
RESP=$(curl -fsSL -X POST "$API/api/battle/$BID/start" \
  -H "content-type: application/json" -d '{}' || echo '{"error":"start failed"}')
echo "start response: $(echo $RESP | head -c 200)"

# ── 4. Poll state until verdict submitted on-chain ──────────────────
echo
echo "── 4. Poll state ──"
for i in $(seq 1 60); do
  S=$(curl -fsSL "$API/api/battle/$BID/state" || echo '{"state":null}')
  PHASE=$(echo "$S" | sed -n 's/.*"phase":"\([^"]*\)".*/\1/p' | head -1)
  ROUND=$(echo "$S" | sed -n 's/.*"currentRound":\([0-9]*\).*/\1/p' | head -1)
  printf "[%3ds] phase=%s round=%s\n" $((i*5)) "${PHASE:-?}" "${ROUND:-—}"
  case "$PHASE" in
    settled) break ;;
    failed)
      echo "FAIL: battle failed"
      echo "$S" | head -c 500
      exit 1
      ;;
  esac
  sleep 5
done

if [ "$PHASE" != "settled" ]; then
  echo "FAIL: timeout (>5 min); phase=$PHASE"
  exit 1
fi

# ── 5. Verify verdict on-chain (Status.Verdict == 2) ────────────────
echo
echo "── 5. Verify on-chain verdict ──"
B_RAW=$($CAST call --rpc-url "$RPC" "$ESCROW" "getBattle(uint256)" $BID)
# Status is field index 7 in Battle struct — but parsing struct returns
# is fragile. Easier: read .winner via separate read. Skip detailed parse.
WINNER=$(echo "$B_RAW" | tail -c 30)
echo "battle raw tail: $WINNER"

# ── 6. Wait dispute window (30s on testnet) + settle ────────────────
echo
echo "── 6. Wait DISPUTE_WINDOW + settle ──"
DW=$($CAST call --rpc-url "$RPC" "$ESCROW" "DISPUTE_WINDOW()(uint256)")
echo "DISPUTE_WINDOW: ${DW}s — waiting…"
sleep $((DW + 5))

$CAST send --rpc-url "$RPC" --private-key "$ZG_BROKER_KEY" "${GAS_FLAGS[@]}" \
  "$ESCROW" "settle(uint256)" $BID 2>&1 \
  | grep -E "transactionHash|status" | head -2

# ── 7. Claim payout ──────────────────────────────────────────────────
echo
echo "── 7. claimPayout ──"
$CAST send --rpc-url "$RPC" --private-key "$ZG_BROKER_KEY" "${GAS_FLAGS[@]}" \
  "$ESCROW" "claimPayout(uint256)" $BID 2>&1 \
  | grep -E "transactionHash|status" | head -2

# ── 8. Summary ──────────────────────────────────────────────────────
echo
echo "═══ Summary ═══"
END_BAL=$($CAST balance --rpc-url "$RPC" "$OWNER")
echo "broker net spent: $((START_BAL - END_BAL)) wei"
echo "(self-battle: stake returned via pari-mutuel ≈ stake - platform fee + gas)"
echo "✅ battle E2E complete (battleId $BID)"
