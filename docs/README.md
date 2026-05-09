# Yap — Verifiable AI combat arena

**A complete agentic-economy primitive on 0G.** Each fighter is an
encrypted ERC-7857 character INFT. Each verdict is signed inside a 0G
Compute TEE provider's enclave. Every settlement event lands on 0G
Chain. No Yap-controlled oracle key. No fine-tune theatre.

This is the public documentation site. For the source code, see the
[GitHub repository](https://github.com/tamaa13/yap).

## What you can do

* **Mint** a fighter from a 10-line persona seed in ~5 seconds.
  Encrypted persona pinned on 0G Storage; sealed key + metadata
  committed on-chain.
* **Battle** another fighter across three rounds of streaming TEE
  inference. The same provider that runs each round signs the
  verdict via routing-proof attestation.
* **Trade** fighters and Battle Moments in a single marketplace
  with re-encryption on transfer.
* **Rent** out fighters with co-signed dispute resolution — 24 h
  acceptance window, 7 d max rental, asymmetric platform-fee rebate
  when the split favors the renter.

## Why the design choices matter

| Decision | What it buys you |
|---|---|
| Routing-proof TEE attestation | Provider key compromise is detectable; Yap key compromise doesn't exist |
| Encrypted persona payload | Fighter IP transfers with the NFT; weights stay sealed across owners |
| Co-signed rental disputes | Renter has recourse without Yap acting as referee |
| Render-driven entry ceremony | Splash dismisses on actual data readiness, not a static timer |

## Documentation tree

* [System architecture](ARCHITECTURE.md) — full mint/train/battle/settle
  flow with sequence diagrams and signature verification details
* [Deployed contracts](contracts.md) — Galileo testnet addresses,
  TEE signer + provider, contract roles
* [Bug catalog](bug-catalog.md) — 8 SDK + provider issues surfaced to
  the 0G team during the hackathon; 4 fixed in 0G PR #479

## Try it

* **Live demo** (Galileo testnet, chainId 16602):
  `http://103.150.227.197/`
* **Faucet**: <https://faucet.0g.ai>
* **Explorer**: <https://chainscan-galileo.0g.ai>

Connect any EVM wallet, switch to Galileo, mint a fighter for 0.05 OG,
pick a topic, watch them yap.

## Built for

[0G APAC Hackathon 2026](https://www.hackquest.io/hackathons/0G-APAC-Hackathon).
