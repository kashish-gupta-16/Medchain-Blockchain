# Aadhaar Handling

**Rule: never store a raw Aadhaar number (or its OTP) anywhere: DB, logs, chain, screenshots.**

**Prototype:**
- Simulated OTP login (fixed/mock OTP flow clearly marked "DEMO").
- If an ID reference is needed: `patient_id_token = HMAC-SHA256(server_secret_pepper, aadhaar_number)` truncated, stored as a token; or a random UUID mapped in DB. Use test numbers only.
- Show only masked form in UI (`XXXX-XXXX-1234`) if at all; better to avoid showing.

**Production path:**
- Authenticate through a UIDAI-registered AUA/KUA, or use **ABHA / ABDM** (Ayushman Bharat Digital Mission) health IDs and consent manager, which is the compliant route for health data in India.
- Follow UIDAI/ABDM rules: Aadhaar number masking, no storage of biometrics/OTP, audit logging.

**On chain:** only random pseudonymous tokens, never Aadhaar-derived values that could be brute-forced (12-digit numbers are guessable, so plain unsalted hashes are unsafe; always use a secret pepper).
