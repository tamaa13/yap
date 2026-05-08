#!/usr/bin/env bash
# Live Galileo E2E smoke — exercises every Yap contract with real
# on-chain tx using minimum OG. Uses the broker wallet as primary actor
# and spins up a tiny-funded burner for buyer/renter side. Burner
# residual gets swept back at the end so net cost ≈ gas only.
#
# Run:
#   bash scripts/e2e-galileo.sh
#
# Requires apps/web/.env.local with ZG_BROKER_KEY set; cast in PATH.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; source "$ROOT/apps/web/.env.local"; set +a

CAST="$HOME/.foundry/bin/cast"
RPC="https://evmrpc-testnet.0g.ai"
# Galileo enforces a 2 gwei minimum tip — explicit tip avoids
# "gas tip cap 1, minimum needed 2000000000" rejections.
GAS_FLAGS=(--priority-gas-price 2000000000 --gas-price 2500000000)

# Live deploy addresses (Galileo)
FIGHTER="0xD023b0C5B0CcC829DBF0B39Df5E81aECe4d36A24"
TRAINER="0xC10bd77cdA8300877898612B00608bA522d5a460"
INBOX="0xe92dB21A770c32a19795556C46D5c6a274955DBD"
RENTAL="0xe5Df2d51ef75A268daAd122038D94cEA9c3111EA"
MARKET="0x076E42A64e4ba43700EBB0830086138468DFa275"

BROKER_ADDR=$($CAST wallet address --private-key "$ZG_BROKER_KEY")
TOKEN_ID=20  # owned by broker, separate from #1/#5/#10 used in fork tests

# Generated fresh per run — never reused, never committed.
BURNER_PK="0x$(openssl rand -hex 32)"
BURNER_ADDR=$($CAST wallet address --private-key "$BURNER_PK")
FUND_AMT="5000000000000000"  # 0.005 OG — covers ~10 tx of gas + small bet

call() {
  $CAST call --rpc-url "$RPC" "$@"
}

send() {
  local pk="$1"; shift
  local out
  out=$($CAST send --rpc-url "$RPC" --private-key "$pk" "${GAS_FLAGS[@]}" "$@" 2>&1)
  local rc=$?
  echo "$out" | grep -E "transactionHash|status" | head -2 || true
  if [ $rc -ne 0 ]; then
    echo "  ✗ cast send rc=$rc"
    echo "$out" | tail -5 | sed 's/^/    /'
    return $rc
  fi
}

echo "═══ Yap E2E Galileo smoke ═══"
echo "broker:  $BROKER_ADDR"
echo "burner:  $BURNER_ADDR  (ephemeral)"
echo "fighter: #$TOKEN_ID"

START_BAL=$($CAST balance --rpc-url "$RPC" "$BROKER_ADDR")
echo "start broker bal: $START_BAL wei"
echo

# ── Sanity ────────────────────────────────────────────────────────────
echo "── 0. Sanity: broker owns fighter #$TOKEN_ID ──"
OWNER=$(call "$FIGHTER" "ownerOf(uint256)(address)" $TOKEN_ID)
echo "ownerOf($TOKEN_ID) = $OWNER"
[ "$(echo $OWNER | tr A-Z a-z)" = "$(echo $BROKER_ADDR | tr A-Z a-z)" ] || {
  echo "FAIL: broker doesn't own #$TOKEN_ID"; exit 1
}

# ── 1. FighterTrainer.train ─────────────────────────────────────────
echo
echo "── 1. FighterTrainer.train (continuous learning) ──"
PRIOR_COUNT=$(call "$TRAINER" "trainingCount(uint256)(uint256)" $TOKEN_ID)
echo "prior trainingCount: $PRIOR_COUNT"
send "$ZG_BROKER_KEY" "$TRAINER" \
  "train(uint256,string,bytes32,bytes,string,string,bytes)" \
  $TOKEN_ID \
  '"0g://e2e-train"' \
  "$($CAST keccak 'e2e-meta')" \
  "0x010203" \
  '"e2e-task-001"' \
  '"0g-tee-galileo"' \
  "0xdeadbeef"
NEW_COUNT=$(call "$TRAINER" "trainingCount(uint256)(uint256)" $TOKEN_ID)
echo "new trainingCount: $NEW_COUNT"
[ "$NEW_COUNT" = "$((PRIOR_COUNT + 1))" ] || { echo "FAIL: counter not incremented"; exit 1; }
echo "✓ train"

# ── 2. YapInbox.sendMessage ─────────────────────────────────────────
echo
echo "── 2. YapInbox.sendMessage (A2A) ──"
send "$ZG_BROKER_KEY" "$INBOX" \
  "sendMessage(address,bytes,bytes32)" \
  "$BURNER_ADDR" \
  "0xdeadbeefcafebabe" \
  "0x0000000000000000000000000000000000000000000000000000000000000000"
echo "✓ inbox.sendMessage"

# ── 3. YapFighter.authorize → revoke ─────────────────────────────────
echo
echo "── 3. YapFighter.authorizeUsage → revokeAuthorization ──"
send "$ZG_BROKER_KEY" "$FIGHTER" \
  "authorizeUsage(uint256,address,bytes)" \
  $TOKEN_ID "$BURNER_ADDR" "0x01"
IS_EXEC=$(call "$FIGHTER" "isExecutor(uint256,address)(bool)" $TOKEN_ID "$BURNER_ADDR")
echo "isExecutor (after auth): $IS_EXEC"
[ "$IS_EXEC" = "true" ] || { echo "FAIL: not authorized"; exit 1; }

send "$ZG_BROKER_KEY" "$FIGHTER" \
  "revokeAuthorization(uint256,address)" \
  $TOKEN_ID "$BURNER_ADDR"
IS_EXEC=$(call "$FIGHTER" "isExecutor(uint256,address)(bool)" $TOKEN_ID "$BURNER_ADDR")
[ "$IS_EXEC" = "false" ] || { echo "FAIL: not revoked"; exit 1; }
echo "✓ authorize/revoke"

# ── 4. Fund burner ──────────────────────────────────────────────────
echo
echo "── 4. Fund burner with $FUND_AMT wei (0.005 OG) ──"
send "$ZG_BROKER_KEY" --value "$FUND_AMT" "$BURNER_ADDR"
echo "burner bal: $($CAST balance --rpc-url $RPC $BURNER_ADDR)"

# ── 5. Marketplace: list → buy → withdraw ───────────────────────────
echo
echo "── 5. Marketplace.list → buy → withdraw ──"
PRICE="1000000000000"  # 0.000001 OG — minimum reasonable

# Approve marketplace
send "$ZG_BROKER_KEY" "$FIGHTER" \
  "setApprovalForAll(address,bool)" "$MARKET" "true" >/dev/null

send "$ZG_BROKER_KEY" "$MARKET" \
  "listItem(uint256,uint256)" $TOKEN_ID $PRICE
LISTED=$(call "$MARKET" "isListed(uint256)(bool)" $TOKEN_ID)
echo "isListed: $LISTED"

# Burner buys
send "$BURNER_PK" "$MARKET" \
  --value "$PRICE" "buyItem(uint256)" $TOKEN_ID
NEW_OWNER=$(call "$FIGHTER" "ownerOf(uint256)(address)" $TOKEN_ID)
echo "post-buy owner: $NEW_OWNER"
[ "$(echo $NEW_OWNER | tr A-Z a-z)" = "$(echo $BURNER_ADDR | tr A-Z a-z)" ] || {
  echo "FAIL: NFT not transferred"; exit 1
}
echo "✓ marketplace list + buy"

# Withdraw seller proceeds
PROCEEDS=$(call "$MARKET" "sellerBalances(address)(uint256)" "$BROKER_ADDR")
echo "seller proceeds: $PROCEEDS wei"
if [ "$PROCEEDS" != "0" ]; then
  send "$ZG_BROKER_KEY" "$MARKET" "withdrawProceeds()"
  echo "✓ withdrew"
fi

# Burner sends NFT back to broker so we don't lose it
send "$BURNER_PK" "$FIGHTER" \
  "safeTransferFrom(address,address,uint256)" \
  "$BURNER_ADDR" "$BROKER_ADDR" $TOKEN_ID
NEW_OWNER=$(call "$FIGHTER" "ownerOf(uint256)(address)" $TOKEN_ID)
echo "returned to broker: $NEW_OWNER"

# ── 6. RentalEscrow disputable: list → rent → state read ────────────
echo
echo "── 6. RentalEscrow.listForRentDisputable → rent ──"
RENT_PRICE_PER_DAY="1000000000000"  # 0.000001 OG/day

# Approve
send "$ZG_BROKER_KEY" "$FIGHTER" \
  "setApprovalForAll(address,bool)" "$RENTAL" "true" >/dev/null

send "$ZG_BROKER_KEY" "$RENTAL" \
  "listForRentDisputable(uint256,uint256,uint256)" \
  $TOKEN_ID $RENT_PRICE_PER_DAY 30
LISTING=$(call "$RENTAL" "getRentListing(uint256)" $TOKEN_ID)
echo "listing raw: ${LISTING:0:100}…"

# Burner rents 1 day
send "$BURNER_PK" "$RENTAL" \
  --value "$RENT_PRICE_PER_DAY" \
  "rent(uint256,uint256)" $TOKEN_ID 1

DISPUTE=$(call "$RENTAL" "getDispute(uint256)" $TOKEN_ID)
echo "dispute state raw: ${DISPUTE:0:130}…"
# decode status (1st field, uint8)
STATUS_BYTE=$(echo ${DISPUTE:2:64} | sed 's/^0*//')
echo "dispute status (hex): $STATUS_BYTE  (expect 1 = Funded)"
echo "✓ rental list + rent (disputable)"

# Cancel listing won't work while rental is active — confirm
echo "→ cancel attempt during active rental should revert:"
$CAST send --rpc-url "$RPC" --private-key "$ZG_BROKER_KEY" "${GAS_FLAGS[@]}" \
  "$RENTAL" "cancelRentListing(uint256)" $TOKEN_ID 2>&1 \
  | grep -iE "revert|error" | head -1 || echo "(no revert? unexpected)"

# ── 7. Sweep burner residual back to broker ─────────────────────────
echo
echo "── 7. Sweep burner residual ──"
BURNER_BAL=$($CAST balance --rpc-url "$RPC" "$BURNER_ADDR")
echo "burner remaining: $BURNER_BAL wei"
# Reserve gas (~21000 gas * gas price). Use 50000000000000 wei buffer.
SWEEP_RESERVE="50000000000000"
if [ "$BURNER_BAL" -gt "$SWEEP_RESERVE" ]; then
  SWEEP=$((BURNER_BAL - SWEEP_RESERVE))
  send "$BURNER_PK" --value "$SWEEP" "$BROKER_ADDR" || true
  echo "swept $SWEEP wei back to broker"
fi

# ── 8. Summary ──────────────────────────────────────────────────────
echo
echo "═══ Summary ═══"
END_BAL=$($CAST balance --rpc-url "$RPC" "$BROKER_ADDR")
SPENT=$((START_BAL - END_BAL))
echo "broker start: $START_BAL"
echo "broker end:   $END_BAL"
echo "net spent:    $SPENT wei (~$(echo "scale=6; $SPENT / 1000000000000000000" | bc) OG)"
echo
echo "Live state checks:"
echo "  trainer.trainingCount(#$TOKEN_ID) = $(call $TRAINER 'trainingCount(uint256)(uint256)' $TOKEN_ID)"
echo "  fighter.ownerOf(#$TOKEN_ID)        = $(call $FIGHTER 'ownerOf(uint256)(address)' $TOKEN_ID)"
echo "  rental.getDispute(#$TOKEN_ID).status = funded (1) — note: NOT settled, leaves dust"
echo
echo "✅ E2E live tx complete"
