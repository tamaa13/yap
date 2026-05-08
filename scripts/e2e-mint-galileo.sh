#!/usr/bin/env bash
# Live mint E2E — runs the FULL mint pipeline end-to-end against the
# Galileo deploy: API call → 0G Compute fine-tune (TEE H100) → encrypted
# weights upload → on-chain mint tx. Real Compute spend, ~7-8 minutes.
#
# Run:
#   bash scripts/e2e-mint-galileo.sh
#
# Override the API base if testing locally:
#   API_URL=http://localhost:3000 bash scripts/e2e-mint-galileo.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; source "$ROOT/apps/web/.env.local"; set +a

CAST="$HOME/.foundry/bin/cast"
RPC="https://evmrpc-testnet.0g.ai"
API="${API_URL:-http://103.150.227.197}"

FIGHTER="0xD023b0C5B0CcC829DBF0B39Df5E81aECe4d36A24"
GAS_FLAGS=(--priority-gas-price 2000000000 --gas-price 2500000000)

OWNER=$($CAST wallet address --private-key "$ZG_BROKER_KEY")
echo "═══ Yap mint E2E (real fine-tune) ═══"
echo "owner: $OWNER"
echo "API:   $API"

START_BAL=$($CAST balance --rpc-url "$RPC" "$OWNER")

# ── 1. Submit mint request ──────────────────────────────────────────
echo
echo "── 1. POST /api/mint/start ──"
RESP=$(curl -fsSL -X POST "$API/api/mint/start" \
  -H "content-type: application/json" \
  -d "$(cat <<JSON
{
  "owner": "$OWNER",
  "name": "smoke-$(date +%s)",
  "archetype": "scholar",
  "avatar": 1,
  "styleSeed": "I argue from first principles. Evidence over rhetoric. Always."
}
JSON
)")
JOB_ID=$(echo "$RESP" | sed -n 's/.*"jobId":"\([^"]*\)".*/\1/p')
if [ -z "$JOB_ID" ]; then
  echo "FAIL: no jobId in response"; echo "$RESP"; exit 1
fi
echo "jobId: $JOB_ID"

# ── 2. Poll status until ready ──────────────────────────────────────
echo
echo "── 2. Poll /api/mint/status/$JOB_ID ──"
for i in $(seq 1 200); do
  S=$(curl -fsSL "$API/api/mint/status/$JOB_ID" || echo '{"status":"network-error"}')
  STATUS=$(echo "$S" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')
  PHASE=$(echo "$S" | sed -n 's/.*"phase":"\([^"]*\)".*/\1/p')
  printf "[%3ds] status=%s phase=%s\n" $((i*5)) "${STATUS:-?}" "${PHASE:-—}"
  case "$STATUS" in
    ready) break ;;
    failed)
      echo "FAIL: pipeline failed"
      echo "$S"
      exit 1
      ;;
  esac
  sleep 5
done

if [ "$STATUS" != "ready" ]; then
  echo "FAIL: timeout (>16 min); status=$STATUS"
  exit 1
fi

# ── 3. Extract mint args from result ────────────────────────────────
echo
echo "── 3. Extract prepare payload ──"
RESULT=$(curl -fsSL "$API/api/mint/status/$JOB_ID")
URI=$(echo "$RESULT" | sed -n 's/.*"encryptedURI":"\([^"]*\)".*/\1/p')
HASH=$(echo "$RESULT" | sed -n 's/.*"metadataHash":"\([^"]*\)".*/\1/p')
SKEY=$(echo "$RESULT" | sed -n 's/.*"sealedKey":"\([^"]*\)".*/\1/p')
echo "encryptedURI: $URI"
echo "metadataHash: $HASH"
echo "sealedKey:    ${SKEY:0:40}…"
[ -n "$URI" ] && [ -n "$HASH" ] && [ -n "$SKEY" ] || {
  echo "FAIL: missing prepare fields"
  echo "$RESULT"
  exit 1
}

# ── 4. Sign mint tx ──────────────────────────────────────────────────
echo
echo "── 4. YapFighter.mint(...) ──"
MINT_FEE=$($CAST call --rpc-url "$RPC" "$FIGHTER" "mintFee()(uint256)")
echo "mintFee: $MINT_FEE"

MINT_OUT=$($CAST send --rpc-url "$RPC" --private-key "$ZG_BROKER_KEY" "${GAS_FLAGS[@]}" \
  --value "$MINT_FEE" \
  "$FIGHTER" \
  "mint(address,string,bytes32,bytes)" \
  "$OWNER" "$URI" "$HASH" "$SKEY" 2>&1)
TX=$(echo "$MINT_OUT" | grep -oE "0x[0-9a-f]{64}" | head -1)
echo "tx: $TX"

# Extract tokenId from Minted event topic 1
echo
echo "── 5. Verify minted ──"
RECEIPT=$($CAST receipt --rpc-url "$RPC" "$TX" --json 2>&1)
NEW_ID_HEX=$(echo "$RECEIPT" | sed -n 's/.*"topics":\["[^"]*","\(0x[^"]*\)".*/\1/p' | head -1)
NEW_ID=$($CAST to-dec "$NEW_ID_HEX" 2>/dev/null || echo "?")
echo "new tokenId: $NEW_ID"

NEW_OWNER=$($CAST call --rpc-url "$RPC" "$FIGHTER" "ownerOf(uint256)(address)" "$NEW_ID")
echo "ownerOf($NEW_ID): $NEW_OWNER"
NEW_URI=$($CAST call --rpc-url "$RPC" "$FIGHTER" "encryptedURI(uint256)(string)" "$NEW_ID")
echo "encryptedURI: $NEW_URI"

# ── 6. Summary ──────────────────────────────────────────────────────
echo
echo "═══ Summary ═══"
END_BAL=$($CAST balance --rpc-url "$RPC" "$OWNER")
echo "broker net spent (gas only — Compute fee ledger separate): $((START_BAL - END_BAL)) wei"
echo "fighter #$NEW_ID minted with real 0G fine-tune"
echo "  encryptedURI: $NEW_URI"
echo "✅ mint E2E complete"
