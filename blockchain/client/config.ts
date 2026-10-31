import "dotenv/config";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
export const connection = new Connection(RPC_URL, "confirmed");

export function loadKeypair(): Keypair {
  const p = process.env.SOLANA_KEYPAIR_PATH ?? ".secrets/devnet-wallet.json";
  const secret = Uint8Array.from(JSON.parse(readFileSync(p, "utf8")));
  return Keypair.fromSecretKey(secret);
}

export function trustedPubkey(): string | undefined {
  return process.env.MEDCHAIN_WALLET_PUBKEY || undefined;
}
