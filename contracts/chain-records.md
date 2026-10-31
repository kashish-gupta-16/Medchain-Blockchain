# Chain Records Contract (owner: Member 3)

Chain = **Solana devnet**, via the **Memo program**. The chain stores only hashes + pseudonymous IDs.
**Never on chain:** names, phone, Aadhaar, addresses, diagnoses, file contents, file names.

## On-chain memo format
`medchain:v1|TYPE|record_id|sha256_hex|unix_ts`

| TYPE | record_id | hash = SHA-256 of |
|---|---|---|
| DOC | document_id (e.g. `doc_8f3a`) | exact file bytes |
| CONSENT | consent_grant_id | `consent_grant_id\|patient_id_token\|accessor_id\|granted_at\|expires_at` |
| REVOKE | consent_grant_id | `REVOKE\|consent_grant_id\|patient_id_token\|accessor_id\|revoked_at` |
| ACCESS (optional) | log_id | `log_id\|doctor_id\|patient_id_token\|document_id\|accessed_at\|action` |

Rules: IDs match `[A-Za-z0-9_-]{1,64}` and must be random/pseudonymous. Timestamps are ISO-8601 UTC
(`2026-10-31T10:00:00Z`) and must be byte-identical when re-hashed. Hash is lowercase hex.

## What Member 1 / Member 2 store in the DB
`solana_tx` (signature) per document / consent / revoke, plus `chain_status` = `confirmed` | `chain_pending`
and `chain_queue_id` when pending. Store the original timestamps exactly as hashed.

## Service API (`npm run serve`, header `X-API-Key`)
| Call | Body | Returns |
|---|---|---|
| POST /document | `{document_id, file_base64}` | `{status, solana_tx?, queue_id?, hash}` |
| POST /consent | `{consent_grant_id, patient_id_token, accessor_id, granted_at, expires_at}` | same |
| POST /revoke | `{consent_grant_id, patient_id_token, accessor_id, revoked_at}` | same |
| POST /access-log | `{log_id, doctor_id, patient_id_token, document_id, accessed_at, action}` | same |
| POST /verify | `{file_base64, solana_tx}` | `{status: verified\|mismatch\|not-found, timestamp, ...}` |
| POST /verify-consent | `{consent:{...5 fields}, solana_tx}` | same |
| GET /status/:queue_id | - | `{status, solana_tx\|null}` (poll to fill in `solana_tx` once pending write lands) |
| POST /retry | - | `{processed, still_pending}` |

Badge rule: show **Verified** only for `status == "verified"`; **Tampered** for `mismatch`; **Not recorded / Pending** otherwise.
Chain writes must never block the user: if `status == "chain_pending"`, continue and poll later.

## Trust note
Anyone can write a memo, so `verify` only accepts records signed by our wallet (`MEDCHAIN_WALLET_PUBKEY`).
