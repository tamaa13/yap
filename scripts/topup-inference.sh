#!/usr/bin/env bash
# Wrapper for the inference sub-account topup. Run this once before
# `e2e-battle-galileo.sh` (or any first-time battle on a fresh broker
# wallet) so the runner doesn't bail with "Sub-account not found".
#
# Reads ZG_BROKER_KEY from apps/web/.env.local. Override defaults via:
#   PROVIDER=0xa48f01...      (default = pinned inference provider)
#   DEPOSIT=0.5               (OG to deposit into broker ledger)
#   TRANSFER=0.5              (OG to move into the per-provider sub-account)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/apps/web"
exec pnpm exec tsx scripts/topup-inference.ts
