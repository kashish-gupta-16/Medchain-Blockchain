# Chain Records Contract (owner: Member 3)

Matches Member 1's `blockchain-integration.md`. Chain = **Solana devnet**, via the **Memo program**.
**On chain: only a record type and a SHA-256 hash.** No IDs, names, phone, Aadhaar, addresses, diagnoses,
file contents or file names. IDs and timestamps stay in the backend DB (and in this service's own store).

## On-chain memo format (v2)
`medchain:v2|TYPE|sha256_hex`   e.g. `medchain:v2|CONSENT|9f2c…e1`

| TYPE | Endpoint | hash = SHA-256 (lowercase hex) of |
|---|---|---|
| DOC | `/document` | the **decoded** file bytes (same as the backend's `doc_hash`) |
| CONSENT | `/consent` | `{"consent_grant_id":…,"patient_id_token":…,"accessor_id":…,"granted_at":…,"expires_at":…}` |
| REVOKE | `/revoke` | `{"consent_grant_id":…,"patient_id_token":…,"accessor_id":…,"revoked_at":…}` |
| ACCESS | `/access-log` | `{"log_id":…,"doctor_id":…,"patient_id_token":…,"document_id":…,"accessed_at":…,"action":…}` |

Canonical form = `JSON.stringify` with keys in exactly the order above, no whitespace, UTF-8. The service rebuilds
it from the parsed fields, so key order, spacing or extra fields in the HTTP body never change the hash.
Older test memos in v1 format (`medchain:v1|TYPE|id|hash|ts`, pipe-joined fields) can still be verified.

## Input rules (otherwise `400 {"error": "..."}`)
- IDs: `[A-Za-z0-9_-]{1,64}` (UUIDs, 24-hex document ids, `timeline`, `none`). Random/pseudonymous only.
- Timestamps: ISO-8601 UTC, whole seconds, `Z`: `2026-11-01T10:00:00Z`. Must be byte-identical when re-sent.
- `expires_at` must be after `granted_at`. `action`: lowercase letters/digits/`_` (e.g. `view_timeline`).
- `file_base64`: valid base64, non-empty. Body limit **20 MB** (`413` above that).

## Service API (header `X-API-Key` on every route except `/health`; wrong/missing key = `401 {"error":"unauthorized"}`)
| Call | Body | Returns |
|---|---|---|
| POST /document | `{document_id, file_base64}` | `{status, solana_tx?, queue_id?, hash}` |
| POST /consent | `{consent_grant_id, patient_id_token, accessor_id, granted_at, expires_at}` | same |
| POST /revoke | `{consent_grant_id, patient_id_token, accessor_id, revoked_at}` | same |
| POST /access-log | `{log_id, doctor_id, patient_id_token, document_id, accessed_at, action}` | same |
| POST /verify | `{file_base64, solana_tx}` | `{status: verified\|mismatch\|not-found, timestamp, record_type, expected_hash, actual_hash, solana_tx, reason?}` |
| POST /verify-consent | `{consent:{5 fields}, solana_tx}` | same |
| GET /status/:queue_id | - | `{status:"confirmed", solana_tx}` or `{status:"chain_pending", solana_tx:null}`; `404` if unknown |
| POST /retry | - | `{processed, still_pending}` (optional; the service retries by itself every 15 s) |
| GET /health | - | `{ok:true}` (no key; for Render) |

Anchor replies:
- `{"status":"confirmed","solana_tx":"5Kq…","hash":"…"}`: done, store `solana_tx`.
- `{"status":"chain_pending","queue_id":"consent_<hash>","hash":"…"}`: poll `GET /status/<queue_id>`.

## Guarantees
- **Fast:** every anchor call answers in about 4–6 s at most. If devnet hasn't confirmed by then, it replies `chain_pending`.
- **Idempotent:** records are keyed by `TYPE + hash`. Re-sending the same record returns the same `solana_tx`
  (or the same `queue_id`) and never writes a second memo. This also works after a restart: on startup the service
  re-reads our wallet's memo history from the chain.
- **Never a double memo:** a sent transaction is re-sent only after its blockhash has expired and it is
  provably not on chain.
- **Out of order is fine:** a revoke is accepted even if its consent was never seen.
- `verify*` only trusts transactions signed by our wallet (`MEDCHAIN_WALLET_PUBKEY`), and the record type must match
  (a CONSENT tx can't "verify" a document).
- `timestamp` = block time, ISO-8601 UTC without milliseconds.

Badge rule: **Verified** only for `status == "verified"`; **Tampered** for `mismatch`; **Not recorded / Pending** otherwise.

## Answers to Member 1's questions (blockchain-integration.md section 10)
1. Dedup: yes, by `TYPE + hash`, and it survives restarts.
2. Body limit: 20 MB.
3. `document_id: "timeline"` (and `none`): accepted.
4. Confirmed replies always include `solana_tx`. Slow ones return `chain_pending` + `queue_id` within the 8 s budget.
5. No need to call `/retry`; the service retries pending writes every 15 s by itself.

**Request for the backend:** if `GET /status/:queue_id` returns `404` (e.g. the service restarted before a pending
write landed), please treat the item as `not_recorded` and resend it. Resending is always safe.
