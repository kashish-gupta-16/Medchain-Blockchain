import { Keypair } from "@solana/web3.js";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { KEYPAIR_PATH } from "../client/config.js";

if (existsSync(KEYPAIR_PATH)) { console.log("Wallet already exists at", KEYPAIR_PATH); process.exit(0); }
mkdirSync(dirname(KEYPAIR_PATH), { recursive: true });
const kp = Keypair.generate();
writeFileSync(KEYPAIR_PATH, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
console.log("Wallet created at", KEYPAIR_PATH, "(.secrets/ is in .gitignore; never commit or share it).");
console.log("PUBLIC KEY:", kp.publicKey.toBase58());
console.log("-> put this in .env as MEDCHAIN_WALLET_PUBKEY");
console.log("-> on Render, set SOLANA_SECRET_KEY to the contents of that file instead of uploading it.");
