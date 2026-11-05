# MedChain Blockchain Layer (Solana devnet)

## Plain-language explanation (for judges)
- A **hash** is a fingerprint of a file: same file = same fingerprint; change one letter = totally different fingerprint. The fingerprint cannot be turned back into the file.
- We write only the fingerprint (and its type) to **Solana**, a public ledger nobody can quietly edit. No names, no IDs, no medical data.
- Later, anyone can re-fingerprint a file and compare. Match = **Verified**. Different = **Tampered**. That is the badge.
- We do the same for **consent**: grant and revoke events are fingerprinted, so a patient's consent history can't be rewritten.
- **devnet** = Solana's free practice network, same technology, no real money.
- Why the Memo program and not a custom contract? It's the simplest reliable approach for a hackathon, and the chain still gives a permanent, timestamped, publicly checkable record.

## Quick start (local)
```bash
cd blockchain
npm ci
cp .env.example .env          # then fill in values (CHAIN_SERVICE_API_KEY: openssl rand -hex 32)
npm run setup                 # creates wallet in .secrets/, prints PUBLIC KEY -> MEDCHAIN_WALLET_PUBKEY in .env
npm run airdrop               # free devnet SOL (or https://faucet.solana.com)
npm test                      # offline tests (fake chain, no network needed)
npm run demo                  # real devnet: write -> verify -> tamper -> resend (no duplicate)
npm start                     # HTTP service on :4010
```

## Deploy on Render (free plan)
- Root directory: `blockchain` · Build: `npm ci` · Start: `npm start` · Health check path: `/health`
- Environment variables:
  - `CHAIN_SERVICE_API_KEY` = same value as the backend's `SOLANA_SERVICE_API_KEY`
  - `SOLANA_SECRET_KEY` = the JSON array from `.secrets/devnet-wallet.json` (do **not** upload the file)
  - `MEDCHAIN_WALLET_PUBKEY` = the wallet's public key
  - `SOLANA_RPC_URL` = `https://api.devnet.solana.com`
- Render sets `PORT`; the service listens on `0.0.0.0`. Give Member 1 the URL (no trailing `/`).
- The free plan has no persistent disk. That's fine: after a restart the service rebuilds its duplicate check from
  the wallet's memo history on chain. Free services sleep, so wake both services before the demo.

## How the backend calls it
```bash
curl -X POST $URL/document -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"document_id":"6724f1c2a9e3b1d4c5e6f7a8","file_base64":"'$(base64 -w0 report.pdf)'"}'
# -> {"status":"confirmed","solana_tx":"5Kx...","hash":"..."}               store solana_tx
# or {"status":"chain_pending","queue_id":"doc_<hash>","hash":"..."}      later GET /status/doc_<hash>
curl -X POST $URL/verify -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"solana_tx":"5Kx...","file_base64":"..."}'
# -> {"status":"verified","timestamp":"2026-11-01T10:00:03Z",...}
```
Full API and guarantees: `contracts/chain-records.md`.

## Code map
| File | What it does |
|---|---|
| `client/server.ts` | HTTP routes, API-key check, 20 MB body limit, no body logging |
| `client/validate.ts` | Input checks (ids, timestamps, base64) |
| `client/hash_document.ts` | SHA-256 + canonical JSON for consent / revoke / access log |
| `client/memo.ts` | `medchain:v2|TYPE|hash` format |
| `client/anchor.ts` | Fast, idempotent, restart-safe anchoring + background retry |
| `client/verify.ts` | Fetch tx, check signer + type, compare hashes |
| `client/chain.ts` | Solana calls (swappable with `tests/fake-chain.ts`) |
| `client/store.ts` | Local record store (`.data/records.json`, gitignored) |
