# Privacy & DPDP Act (India) Alignment

*Prototype alignment, not legal advice.*

- **Consent:** explicit, informed, granular (per doctor, scope, expiry), withdrawable any time (revoke = immediate deny). Consent events hashed on chain as tamper-evident history.
- **Purpose limitation:** consent states purpose (e.g. "treatment"); data used only for that.
- **Data minimisation:** collect only what is needed; chain holds hashes + pseudonymous IDs only.
- **Storage limitation:** expired consent = no access; retention period defined; delete on request.
- **Right to erasure / correction:** delete files + personal data off-chain (DB, storage, backups on schedule). Chain keeps only an irreversible hash that reveals nothing once the file is gone. Honest framing: chain records cannot be edited, which is why no personal data goes there.
- **Access right:** patient can see who accessed what (access log).
- **Security safeguards:** see encryption.md and threat-model.md.
- **Breach response outline:** 1) detect/contain (revoke keys, disable access) 2) assess scope using access logs 3) notify Data Protection Board and affected patients as required 4) fix root cause 5) post-incident review.
- **Children / guardians:** verifiable parental consent needed for minors (future work).
- **Grievance contact:** name an officer in the app/policy page.
