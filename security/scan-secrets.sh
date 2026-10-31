#!/usr/bin/env bash
# Quick secret scan (not a replacement for gitleaks/trufflehog).
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
PAT='(PRIVATE KEY|secret[_-]?key|api[_-]?key|password|passwd|JWT_SECRET|aadhaar)[^a-zA-Z]{0,5}[=:][ ]*["'"'"']?[A-Za-z0-9+/_\-]{8,}'
HITS=$(grep -RInE "$PAT" . --exclude-dir=node_modules --exclude-dir=.git --exclude=.env.example --exclude=scan-secrets.sh --exclude=*.md | head -50)
JSONKEYS=$(find . -name "*keypair*.json" -o -name "devnet-wallet.json" | grep -v node_modules)
[ -n "$HITS" ] && echo "Possible secrets:" && echo "$HITS"
[ -n "$JSONKEYS" ] && echo "Wallet files present (must be gitignored):" && echo "$JSONKEYS" && git check-ignore $JSONKEYS >/dev/null 2>&1 || true
[ -z "$HITS" ] && echo "No obvious secrets found."
