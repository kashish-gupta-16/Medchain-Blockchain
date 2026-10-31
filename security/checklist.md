# Pre-Demo Security Checklist
Run `bash security/scan-secrets.sh` first.

- [ ] No secrets in repo/history (`.env`, wallet json, API keys, JWT secret)
- [ ] `.env.example` present, real `.env` ignored
- [ ] Consent required for **every** doctor read (try without consent -> 403)
- [ ] Consent expiry works (expired -> 403)
- [ ] Revoke works immediately (revoked -> 403)
- [ ] Doctor A cannot read Doctor B's patients / any other patient (no IDOR)
- [ ] Upload allow-list: .exe/.html/.svg/.js rejected; oversized file rejected; wrong magic bytes rejected
- [ ] Tampered file shows "mismatch"/Tampered badge
- [ ] Chain down -> app still works, entry shows "chain pending", retry later succeeds
- [ ] Rate limits on login/OTP/upload
- [ ] No names/phone/Aadhaar/medical content in logs or on chain
- [ ] HTTPS on demo URL, CORS restricted
- [ ] Test/default accounts and debug endpoints removed (or clearly demo-only)
- [ ] Chain-service API key set (not "change-me"), port not public
- [ ] Wallet has enough devnet SOL (`npm run balance`)
