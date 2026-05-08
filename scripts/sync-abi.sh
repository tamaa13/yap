#!/usr/bin/env bash
# Sync ABI JSONs from Foundry output into Next.js app.
# Run after `pnpm contracts:build` to refresh ABIs.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/contracts/out"
ABI_DIR="$ROOT/apps/web/lib/abi"

if [ ! -d "$OUT" ]; then
  echo "Error: $OUT not found. Run 'pnpm contracts:build' first."
  exit 1
fi

mkdir -p "$ABI_DIR"

for c in YapFighter BattleEscrow BattleRegistry YapMarketplace RentalEscrow FighterTrainer YapInbox MomentINFT YapSubnameRegistrar; do
  src="$OUT/$c.sol/$c.json"
  if [ ! -f "$src" ]; then
    echo "Missing: $src"
    exit 1
  fi
  jq '.abi' "$src" > "$ABI_DIR/$c.json"
  entries=$(jq 'length' "$ABI_DIR/$c.json")
  echo "✓ $c → $entries ABI entries"
done

echo
echo "ABIs synced to apps/web/lib/abi/"
