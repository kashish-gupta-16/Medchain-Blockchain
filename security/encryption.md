# Encryption & Key Handling

**In transit:** HTTPS/TLS 1.2+ everywhere (demo via ngrok/Cloudflare/hosting TLS). Chain service listens on
localhost/private network only. Solana RPC is HTTPS.

**At rest:**
- Files: store encrypted (AES-256-GCM, per-file random nonce); key from env/secret manager, not in code.
  Prototype fallback: encrypted disk/bucket-level encryption (e.g. managed storage SSE).
- Database: managed DB with disk encryption; sensitive columns (phone, name) encrypted at field level or minimised.
- Passwords/OTP: never stored plain; OTPs hashed + short expiry.
- Aadhaar: never stored raw (see aadhaar-handling.md).

**Secrets:** `.env` + `blockchain/.secrets/` are in `.gitignore`. Only `.env.example` is committed.
Separate keys for: JWT signing, file encryption, chain wallet, chain-service API key. Rotate if leaked.
Run `security/scan-secrets.sh` before every push.

**Chain wallet:** devnet wallet holds no value. In production use a managed key (KMS/HSM) and a custom
program with an authority account.

**Key rotation outline:** generate new key -> re-encrypt files in background -> retire old key.
