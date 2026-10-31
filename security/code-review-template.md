# Code Review Report (Step 9)
Review Member 1/2 code; list each finding as: **Severity | File:line | Issue | Fix**

Look for: hardcoded secrets; string-built SQL (use parameters); missing `check_consent()` on read routes;
object-ID access without ownership check; logs containing name/phone/Aadhaar/diagnosis; unrestricted uploads;
verbose errors leaking internals; wildcard CORS; no rate limit; JWT without expiry; debug/test accounts.

| Severity | Location | Issue | Fix |
|---|---|---|---|
| High | | | |
