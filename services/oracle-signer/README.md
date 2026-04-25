# Yap Oracle Signer

TEE-attested verdict signer for Yap battles. Holds the oracle private key
inside an enclave and exposes a tightly-scoped HTTP signing endpoint.

The Yap relayer (`apps/web` runner) calls this service whenever a battle
verdict is ready to submit on-chain. The signer:

1. Validates an HMAC-authed request from the relayer
2. Computes the `BattleEscrow.verdictDigest` matching the on-chain digest
3. Signs with a key that lives only in enclave-protected memory
4. Returns the ECDSA signature

The on-chain `BattleEscrow.oracleKey` is set to the signer's enclave-derived
public address. Spectators verify the chain by:

- Fetching the signer's `/attestation` (returns a TDX quote)
- Verifying the quote against Intel PCS
- Reading the user-data field from the quote → matches `oracleKey` on-chain

→ Cryptographic proof that on-chain verdicts are produced inside this
specific attested enclave, not by an operator-controlled key.

## Layout

```
src/
  server.ts   Express app — /health, /info, /attestation, /sign
  key.ts      dstack key derivation + simulator/dev fallback
  auth.ts     HMAC + timestamp window for /sign auth
Dockerfile
docker-compose.yaml   Phala dstack deployment manifest
```

## Endpoints

| Method | Path           | Auth | Purpose                                    |
|--------|----------------|------|--------------------------------------------|
| GET    | /health        | none | Liveness                                   |
| GET    | /info          | none | Signer address + key source (dstack/sim/dev) |
| GET    | /attestation   | none | TDX quote binding signer address (or 503 if not in TEE) |
| POST   | /sign          | HMAC | Sign a verdict digest                      |

### POST /sign request

```json
{
  "battleId": "42",
  "winner": 0,
  "verdictHash": "0x...64-hex...",
  "escrowAddress": "0x...40-hex...",
  "chainId": "16661",
  "timestamp": 1714234567890,
  "hmac": "<hex sha256-hmac of canonical(payload, secret)>"
}
```

Canonical payload format:
`battleId|winner|verdictHash|escrowAddress|chainId|timestamp` (all strings,
verdictHash + escrowAddress lowercased).

### POST /sign response

```json
{
  "address": "0x...",
  "signature": "0x...130-hex...",
  "innerHash": "0x...64-hex...",
  "source": "dstack" | "simulator" | "dev-fallback"
}
```

## Local development

```bash
# Install
pnpm -F yap-oracle-signer install

# Run with a stable dev key (no real TEE)
ORACLE_DEV_PRIVATE_KEY=0x... \
ORACLE_SIGNER_SECRET=devsecret \
pnpm -F yap-oracle-signer dev

# Or run against the dstack simulator (https://github.com/Dstack-TEE/dstack)
DSTACK_SIMULATOR_ENDPOINT=http://localhost:7777 \
ORACLE_SIGNER_SECRET=devsecret \
pnpm -F yap-oracle-signer dev
```

## Deploying to Phala dstack (mainnet path)

### 1. Build + publish the Docker image

```bash
cd services/oracle-signer
docker build -t ghcr.io/<your-handle>/yap-oracle-signer:v1 .
docker push ghcr.io/<your-handle>/yap-oracle-signer:v1
```

### 2. Update the compose manifest

Edit `docker-compose.yaml` → swap the `image:` line for your published tag.
**Pin to a content-addressed digest** (`@sha256:...`) so the deployed
container hash is reproducible:

```yaml
image: ghcr.io/<your-handle>/yap-oracle-signer@sha256:<digest>
```

### 3. Deploy via Phala Cloud

```bash
# Sign up at https://cloud.phala.com/register (free credits available)
# Install the Phala CLI (one-time)
npm install -g phala-cloud-cli
phala auth login

# Deploy
phala cvms create \
  --name yap-oracle-signer \
  --compose docker-compose.yaml \
  --env-file phala.env  # holds ORACLE_SIGNER_SECRET only
```

Phala returns:

- A content-addressed HTTPS URL (e.g. `https://0xabcd.dstack.host`)
- The TDX attestation report
- The deployed image digest

### 4. Read the signer's enclave-derived address

```bash
curl https://<your-cvm>.dstack.host/info
# {
#   "address": "0xSIGNER...",
#   "source": "dstack",
#   "appId": "0x...",
#   "instanceId": "0x...",
#   "attestationAvailable": true
# }
```

### 5. Rotate the on-chain `oracleKey`

```bash
# From the Yap admin wallet
cast send <BattleEscrow address> \
  "setOracleKey(address)" 0xSIGNER... \
  --rpc-url $ZG_TESTNET_RPC --private-key $ADMIN_KEY
```

This emits an `OracleKeyUpdated(prev, new)` event. Off-chain spectators
should match the new key against the signer's `/attestation` to confirm
the rotation lands in the audited enclave.

### 6. Point the Yap relayer at the new signer

```bash
# In apps/web/.env.local
ZG_ORACLE_SIGNER_URL=https://<your-cvm>.dstack.host
ZG_ORACLE_SIGNER_SECRET=<same secret as the dstack env>
```

## Security notes

- **Image hash matters.** The whole attestation story rests on the image
  hash being content-addressed and reviewed. Pin by digest, not by tag.
- **Shared secret rotation.** If the relayer's `ZG_ORACLE_SIGNER_SECRET`
  leaks, the signer can be DoS'd (attacker requests sigs for arbitrary
  battles), but the attacker still can't extract the private key. Rotate
  the secret + re-deploy when in doubt.
- **Timestamp window.** Replays of valid HMACs are blocked by the ±60s
  window. Set NTP on both sides; large clock drift will reject all requests.
- **Fail-closed.** The signer refuses to start without a key source.
  If both dstack and the dev fallback are missing, it exits 1.
