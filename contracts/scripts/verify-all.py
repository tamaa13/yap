#!/usr/bin/env python3
"""
Verify all deployed Yap contracts on chainscan*.0g.ai.

Usage:
    python3 scripts/verify-all.py [--network mainnet|testnet]

Default: testnet (Galileo). Set --network mainnet for Aristotle.

Both chainscan endpoints expose an Etherscan-compatible /open/api
(the SPA verify form POSTs module=contract action=verifysourcecode).
This script automates the same flow programmatically.

Pre-reqs:
- Run from contracts/ directory
- standard-json-input.json files exist under verify/<Name>/
  (regenerate with `forge verify-contract <addr> <path:name>
   --chain-id <16602|16661> --show-standard-json-input`)

Caveats:
- Pre-deploy source drift: if a contract's source has changed since
  deployment, the recompiled bytecode won't match. For YapFighter
  specifically, the on-chain deploy at 0xd023... predates the
  proof-replay-protection commit (9b693f1); regenerate its JSON
  from the parent commit before verification:

    git show 46b1363:contracts/src/YapFighter.sol > /tmp/yf.sol
    cp src/YapFighter.sol /tmp/yf-current.sol
    cp /tmp/yf.sol src/YapFighter.sol
    forge build && forge verify-contract <addr> src/YapFighter.sol:YapFighter \
        --chain-id 16602 --show-standard-json-input \
      | python3 -c "import sys; raw=sys.stdin.buffer.read(); print(raw[raw.find(b'{'):].decode())" \
      > verify/YapFighter/standard-json-input.json
    cp /tmp/yf-current.sol src/YapFighter.sol
    forge build  # restore current
- MomentMarketplace shares source with YapMarketplace (different
  ctor args). Use YapMarketplace's JSON for both.
"""
import urllib.request
import urllib.parse
import time
import json
import sys

COMPILER = "v0.8.24+commit.e11b9ed9"

# Per-network endpoint config. URL is the chainscan /open/api.
NETWORKS = {
    "testnet": {
        "url": "https://chainscan-galileo.0g.ai/open/api",
        "chain_id": 16602,
        # v3 redeploys (Strategy A full cascade — see docs/REDEPLOY_V2_CEREMONY.md).
        # v2 ecosystem orphaned on 2026-05-13 (second cascade — persona scoring
        # + archetype + ability lib forced a fresh deploy).
        "contracts": [
            ("YapInbox",            "0xe92dB21A770c32a19795556C46D5c6a274955DBD", "src/YapInbox.sol:YapInbox",                 "verify/YapInbox/standard-json-input.json"),
            ("YapFighter",          "0x066259CCB37C0AF962c112a70C6338e52e1D16ee", "src/YapFighter.sol:YapFighter",             "verify/YapFighter/standard-json-input.json"),
            ("BattleEscrow",        "0x06c61C3112B98Afc16002bD523D26eF836e7e659", "src/BattleEscrow.sol:BattleEscrow",         "verify/BattleEscrow/standard-json-input.json"),
            ("BattleRegistry",      "0x104a65bf0cB4fAE0F4bb606cE1694115Ce87F2A1", "src/BattleRegistry.sol:BattleRegistry",     "verify/BattleRegistry/standard-json-input.json"),
            ("YapMarketplace",      "0x9569cE03CD9934Fd206A40b3721f7Ae3DC2a1f36", "src/YapMarketplace.sol:YapMarketplace",     "verify/YapMarketplace/standard-json-input.json"),
            ("RentalEscrow",        "0xE986a6C47dA1fD3c0b01EC6695Ccf020EC16bC96", "src/RentalEscrow.sol:RentalEscrow",         "verify/RentalEscrow/standard-json-input.json"),
            ("MomentINFT",          "0x86cdEe1aF79dd9F56AA5358Eb0Ae39F96dbD4DbB", "src/MomentINFT.sol:MomentINFT",             "verify/MomentINFT/standard-json-input.json"),
            ("MomentMarketplace",   "0x13f52f5787fcE95364Bf0CDeE96D5dB3ab4B12bD", "src/YapMarketplace.sol:YapMarketplace",     "verify/YapMarketplace/standard-json-input.json"),
            ("YapSubnameRegistrar", "0xF5F99bd86b00ad32D16E1Ae97Dd4aaa7AdeD5c8C", "src/YapSubnameRegistrar.sol:YapSubnameRegistrar", "verify/YapSubnameRegistrar/standard-json-input.json"),
            ("AbilityEscrow",       "0x18563e7E015c9e5742485E47698E067FAff279e6", "src/AbilityEscrow.sol:AbilityEscrow",       "verify/AbilityEscrow/standard-json-input.json"),
        ],
    },
    "mainnet": {
        "url": "https://chainscan.0g.ai/open/api",
        "chain_id": 16661,
        # Aristotle (16661) v3 cascade — deployed 2026-05-13.
        # Addresses where ctor args reference only YapFighter (no escrow/registry
        # cross-refs) match testnet because CREATE2 sees the same deployer + salt
        # + bytecode + ctor args. BattleEscrow + its downstream differ because
        # mainnet oracleKey is qwen3.6-plus's TEE signer, not the testnet one.
        "contracts": [
            ("YapInbox",            "0xe92dB21A770c32a19795556C46D5c6a274955DBD", "src/YapInbox.sol:YapInbox",                 "verify/YapInbox/standard-json-input.json"),
            ("YapFighter",          "0x066259CCB37C0AF962c112a70C6338e52e1D16ee", "src/YapFighter.sol:YapFighter",             "verify/YapFighter/standard-json-input.json"),
            ("BattleEscrow",        "0x242d1cd3100706b26a3067dd64cecb415a20f398", "src/BattleEscrow.sol:BattleEscrow",         "verify/BattleEscrow/standard-json-input.json"),
            ("BattleRegistry",      "0x4ec3eb96161fbef86849d40a5d331d3c1209d5de", "src/BattleRegistry.sol:BattleRegistry",     "verify/BattleRegistry/standard-json-input.json"),
            ("YapMarketplace",      "0x9569cE03CD9934Fd206A40b3721f7Ae3DC2a1f36", "src/YapMarketplace.sol:YapMarketplace",     "verify/YapMarketplace/standard-json-input.json"),
            ("RentalEscrow",        "0xE986a6C47dA1fD3c0b01EC6695Ccf020EC16bC96", "src/RentalEscrow.sol:RentalEscrow",         "verify/RentalEscrow/standard-json-input.json"),
            ("MomentINFT",          "0x059adf223c3281302d25ac36a4f861ef4b5df169", "src/MomentINFT.sol:MomentINFT",             "verify/MomentINFT/standard-json-input.json"),
            ("MomentMarketplace",   "0x35125df161d64a8ac59936c0dbfcfe30c9f4220d", "src/YapMarketplace.sol:YapMarketplace",     "verify/YapMarketplace/standard-json-input.json"),
            ("YapSubnameRegistrar", "0xF5F99bd86b00ad32D16E1Ae97Dd4aaa7AdeD5c8C", "src/YapSubnameRegistrar.sol:YapSubnameRegistrar", "verify/YapSubnameRegistrar/standard-json-input.json"),
            ("AbilityEscrow",       "0x2cc877baa12be163973a43cac998b8d82b3a58a4", "src/AbilityEscrow.sol:AbilityEscrow",       "verify/AbilityEscrow/standard-json-input.json"),
        ],
    },
}


def parse_network():
    network = "testnet"  # default
    for i, arg in enumerate(sys.argv):
        if arg == "--network" and i + 1 < len(sys.argv):
            network = sys.argv[i + 1]
    if network not in NETWORKS:
        print(f"ERROR: --network must be one of {list(NETWORKS.keys())} (got: {network})", file=sys.stderr)
        sys.exit(2)
    return network


# Resolved at runtime — overwritten by main() based on --network flag.
URL = NETWORKS["testnet"]["url"]
CONTRACTS = NETWORKS["testnet"]["contracts"]


def submit(addr: str, sji_path: str, contractname: str) -> dict:
    with open(sji_path, "r") as f:
        sji = f.read()
    data = {
        "module": "contract",
        "action": "verifysourcecode",
        "contractaddress": addr,
        "sourceCode": sji,
        "codeformat": "solidity-standard-json-input",
        "contractname": contractname,
        "compilerversion": COMPILER,
        "licenseType": "3",  # MIT
    }
    encoded = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(
        URL, data=encoded, method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode())


def poll(guid: str, max_attempts: int = 20) -> str:
    for i in range(max_attempts):
        time.sleep(3)
        body = urllib.request.urlopen(
            f"{URL}?module=contract&action=checkverifystatus&guid={guid}",
            timeout=10,
        ).read().decode()
        result = json.loads(body).get("result", "")
        if any(k in result for k in ("Pass", "Fail", "mismatch", "not_found", "already")):
            return result
    return "TIMEOUT"


def main() -> int:
    global URL, CONTRACTS
    network = parse_network()
    URL = NETWORKS[network]["url"]
    CONTRACTS = NETWORKS[network]["contracts"]
    print(f"=== Network: {network} (chain {NETWORKS[network]['chain_id']}) ===", flush=True)
    print(f"=== Endpoint: {URL} ===", flush=True)

    # Sanity-check mainnet addresses populated (testnet always populated).
    if network == "mainnet" and any(not c[1] for c in CONTRACTS):
        missing = [c[0] for c in CONTRACTS if not c[1]]
        print(f"ERROR: mainnet addresses missing for: {', '.join(missing)}", file=sys.stderr)
        print("       Populate NETWORKS['mainnet']['contracts'] in this script post-ceremony.", file=sys.stderr)
        return 2

    results = []
    for name, addr, contractname, sji in CONTRACTS:
        print(f"\n--- {name} @ {addr} ---", flush=True)
        try:
            r = submit(addr, sji, contractname)
        except Exception as e:
            print(f"  submit error: {e}", flush=True)
            results.append((name, f"SUBMIT_ERROR: {e}"))
            continue
        if r.get("status") == "1":
            print(f"  submit OK, guid={r.get('result')}", flush=True)
            verdict = poll(r["result"])
            print(f"  verdict: {verdict}", flush=True)
            results.append((name, verdict))
        else:
            print(f"  submit failed: {r}", flush=True)
            results.append((name, f"SUBMIT_FAIL: {str(r)[:100]}"))

    print("\n========== SUMMARY ==========")
    failed = 0
    for n, v in results:
        ok = "✓" if "Pass" in v or "already" in v else "✗"
        if ok == "✗":
            failed += 1
        print(f"  {ok}  {n:25s} {v[:80]}")
    return failed


if __name__ == "__main__":
    sys.exit(main())
