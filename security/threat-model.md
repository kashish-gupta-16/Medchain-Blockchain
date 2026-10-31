“Scope: hackathon prototype”
# Threat Model

| Attacker | Goal | Defenses |
|---|---|---|
| **Curious doctor** | Read patients they have no consent for | Every read checks an active consent row (patient+doctor, not expired, not revoked); default deny; every access logged (+ optional hash on chain); doctor can only list patients who granted access |
| **Stolen phone** | Use patient's session | Short-lived access tokens, refresh rotation, logout/revoke sessions, OTP re-auth for consent changes, no files cached unencrypted, app lock/biometric |
| **Malicious uploader** | Upload malware / fake report / huge file | Allow-list types (PDF/JPG/PNG), check magic bytes not just extension, size limit, random server-side filenames, no execution, antivirus scan if time; hash recorded so later edits are detectable |
| **Insider (dev/admin)** | Browse DB or alter records | Encrypted files/DB fields, least-privilege DB roles, no PII in logs, admin actions logged, chain hashes expose tampering of documents and consent history |
| **API attacker** | Brute force OTP, injection, IDOR | Rate limits + lockout, parameterised queries, authz check on every object ID (no IDOR), input validation, CORS locked down |
| **Chain-layer abuse** | Fake "verified" proofs | `verify` trusts only our wallet's signatures; service needs API key; chain holds no PII |

Out of scope for prototype: nation-state attackers, device malware, full HSM key management.
