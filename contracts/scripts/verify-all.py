#!/usr/bin/env python3
"""
Verify all deployed Yap contracts on chainscan-galileo.0g.ai.

chainscan-galileo's /open endpoint is Etherscan-compatible (the SPA's
verify form POSTs to /open/api with module=contract action=verifysourcecode).
This script automates the same flow programmatically.

Pre-reqs:
- Run from contracts/ directory
- standard-json-input.json files exist under verify/<Name>/
  (regenerate with `forge verify-contract <addr> <path:name>
   --chain-id 16602 --show-standard-json-input`)

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

URL = "https://chainscan-galileo.0g.ai/open/api"
COMPILER = "v0.8.24+commit.e11b9ed9"

# (name, address, contractname-for-api, json-input-file)
CONTRACTS = [
    ("YapInbox",            "0xe92dB21A770c32a19795556C46D5c6a274955DBD", "src/YapInbox.sol:YapInbox",                 "verify/YapInbox/standard-json-input.json"),
    # v3 redeploys (Strategy A full cascade — see docs/REDEPLOY_V2_CEREMONY.md).
    # v2 ecosystem orphaned on 2026-05-13 (second cascade — persona scoring
    # + archetype + ability lib forced a fresh deploy).
    ("YapFighter",          "0x066259CCB37C0AF962c112a70C6338e52e1D16ee", "src/YapFighter.sol:YapFighter",             "verify/YapFighter/standard-json-input.json"),
    ("BattleEscrow",        "0x06c61C3112B98Afc16002bD523D26eF836e7e659", "src/BattleEscrow.sol:BattleEscrow",         "verify/BattleEscrow/standard-json-input.json"),
    ("BattleRegistry",      "0x104a65bf0cB4fAE0F4bb606cE1694115Ce87F2A1", "src/BattleRegistry.sol:BattleRegistry",     "verify/BattleRegistry/standard-json-input.json"),
    ("YapMarketplace",      "0x9569cE03CD9934Fd206A40b3721f7Ae3DC2a1f36", "src/YapMarketplace.sol:YapMarketplace",     "verify/YapMarketplace/standard-json-input.json"),
    ("RentalEscrow",        "0xE986a6C47dA1fD3c0b01EC6695Ccf020EC16bC96", "src/RentalEscrow.sol:RentalEscrow",         "verify/RentalEscrow/standard-json-input.json"),
    ("MomentINFT",          "0x86cdEe1aF79dd9F56AA5358Eb0Ae39F96dbD4DbB", "src/MomentINFT.sol:MomentINFT",             "verify/MomentINFT/standard-json-input.json"),
    ("MomentMarketplace",   "0x13f52f5787fcE95364Bf0CDeE96D5dB3ab4B12bD", "src/YapMarketplace.sol:YapMarketplace",     "verify/YapMarketplace/standard-json-input.json"),
    ("YapSubnameRegistrar", "0xF5F99bd86b00ad32D16E1Ae97Dd4aaa7AdeD5c8C", "src/YapSubnameRegistrar.sol:YapSubnameRegistrar", "verify/YapSubnameRegistrar/standard-json-input.json"),
    ("AbilityEscrow",       "0x18563e7E015c9e5742485E47698E067FAff279e6", "src/AbilityEscrow.sol:AbilityEscrow",       "verify/AbilityEscrow/standard-json-input.json"),
]


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
