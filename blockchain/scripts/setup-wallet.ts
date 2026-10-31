import { Keypair } from "@solana/web3.js";
import { existsSync, mkdirSync, writeFileSync } from "fs";
const path = ".secrets/devnet-wallet.json";
if (existsSync(path)) { console.log("Wallet already exists at", path); process.exit(0); }
mkdirSync(".secrets", { recursive: true });
const kp = Keypair.generate();
writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
console.log("Wallet created (private key saved in .secrets/, which is gitignored).");
console.log("PUBLIC KEY:", kp.publicKey.toBase58());
console.log("-> put this in .env as MEDCHAIN_WALLET_PUBKEY");
