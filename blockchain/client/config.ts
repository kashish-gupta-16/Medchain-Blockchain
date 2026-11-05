import dotenv from "dotenv";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { existsSync, readFileSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";
import { fileURLToPath } from "url";

/** The blockchain/ folder. Paths resolve from here, not from wherever the process was started. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: resolve(ROOT, ".env") });
export const fromRoot = (p: string) => (isAbsolute(p) ? p : resolve(ROOT, p));

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
export const connection = new Connection(RPC_URL, "confirmed");

export const KEYPAIR_PATH = fromRoot(process.env.SOLANA_KEYPAIR_PATH || ".secrets/devnet-wallet.json");
export const STORE_PATH = fromRoot(process.env.CHAIN_STORE_PATH || ".data/records.json");

let cached: Keypair | undefined;
/**
 * Wallet secret key. On Render set SOLANA_SECRET_KEY to the JSON array from .secrets/devnet-wallet.json.
 * Locally the file is used.
 */
export function loadKeypair(): Keypair {
  if (cached) return cached;
  const raw = process.env.SOLANA_SECRET_KEY?.trim()
    || (existsSync(KEYPAIR_PATH) ? readFileSync(KEYPAIR_PATH, "utf8") : "");
  if (!raw) throw new Error(`no wallet: set SOLANA_SECRET_KEY or run "npm run setup" (looked for ${KEYPAIR_PATH})`);
  let bytes: number[];
  try { bytes = JSON.parse(raw); } catch { throw new Error("wallet secret must be a JSON array of 64 numbers"); }
  if (!Array.isArray(bytes) || bytes.length !== 64) throw new Error("wallet secret must be a JSON array of 64 numbers");
  return (cached = Keypair.fromSecretKey(Uint8Array.from(bytes)));
}

/**
 * The only wallet whose memos we trust. Fails closed: if neither MEDCHAIN_WALLET_PUBKEY nor a wallet is
 * available, this throws instead of trusting everyone.
 */
export function trustedPubkey(): string {
  const env = process.env.MEDCHAIN_WALLET_PUBKEY?.trim();
  if (env) return new PublicKey(env).toBase58();
  return loadKeypair().publicKey.toBase58();
}
