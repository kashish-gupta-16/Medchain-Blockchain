# MedChain Blockchain Layer (Solana devnet)

## Plain-language explanation (for judges)
- A **hash** is a fingerprint of a file: same file = same fingerprint; change one letter = totally different fingerprint. The fingerprint cannot be turned back into the file.
- We write only the fingerprint (plus a random ID and time) to **Solana**, a public ledger nobody can quietly edit. No names, no medical data.
- Later, anyone can re-fingerprint a file and compare. Match = **Verified**. Different = **Tampered**. That is the badge.
- We do the same for **consent**: grant and revoke events are fingerprinted, so a patient's consent history can't be rewritten.
- **devnet** = Solana's free practice network, same technology, no real money.
- Why Memo program, not custom contract? Simplest reliable approach for a hackathon; the chain still gives a permanent, timestamped, publicly checkable record.

## Quick start
```bash
cd blockchain
npm install
cp .env.example .env          # then edit values
npm run setup                 # creates wallet in .secrets/, prints PUBLIC KEY -> put in .env
npm run airdrop               # free devnet SOL
npm test                      # offline tests
npm run demo                  # real devnet write + verify + tamper
npm run serve                 # HTTP service on :4010
```
## How Member 1 / Member 2 call it
```bash
curl -X POST localhost:4010/document -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"document_id":"doc_001","file_base64":"'$(base64 -w0 report.pdf)'"}'
# -> {"status":"confirmed","solana_tx":"5Kx...","hash":"..."}   store solana_tx in DB
# or {"status":"chain_pending","queue_id":"..."} -> continue; later GET /status/<queue_id>
curl -X POST localhost:4010/verify -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"solana_tx":"5Kx...","file_base64":"..."}'
# -> {"status":"verified","timestamp":"2026-10-31T10:00:00.000Z",...}
```
Python: `requests.post("http://localhost:4010/document", headers={"X-API-Key": KEY}, json={...})`.
Full API in `contracts/chain-records.md`.
