import { connection, trustedPubkey } from "./config.js";
import { ChainRecord, parseMemo } from "./memo.js";
import { hash_document } from "./hash_document.js";

export interface VerifyResult {
  status: "verified" | "mismatch" | "not-found";
  timestamp?: string; document_id?: string; expected_hash?: string; actual_hash?: string; reason?: string;
}

/** Pure comparison (easy to unit test). */
export function compareRecord(actualHash: string, rec: ChainRecord | null, blockTime?: number | null): VerifyResult {
  if (!rec) return { status: "not-found", reason: "no valid MedChain record in this transaction" };
  const ts = new Date((blockTime ?? rec.ts) * 1000).toISOString();
  return actualHash === rec.hash
    ? { status: "verified", timestamp: ts, document_id: rec.id, expected_hash: rec.hash, actual_hash: actualHash }
    : { status: "mismatch", timestamp: ts, document_id: rec.id, expected_hash: rec.hash, actual_hash: actualHash, reason: "file changed after it was recorded" };
}

/** Fetch the memo record from a transaction. Only trusts our own wallet as the signer. */
export async function fetchRecord(solana_tx: string): Promise<{ rec: ChainRecord | null; blockTime?: number | null }> {
  const tx = await connection.getParsedTransaction(solana_tx, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!tx) return { rec: null };
  const trusted = trustedPubkey();
  const signer = tx.transaction.message.accountKeys[0]?.pubkey.toBase58();
  if (trusted && signer !== trusted) return { rec: null, blockTime: tx.blockTime }; // someone else's memo: ignore
  for (const ix of tx.transaction.message.instructions) {
    if ("parsed" in ix && ix.program === "spl-memo" && typeof ix.parsed === "string") {
      return { rec: parseMemo(ix.parsed), blockTime: tx.blockTime };
    }
  }
  return { rec: null, blockTime: tx.blockTime };
}

/** Re-hash the file, fetch the on-chain record, compare. Powers the "verified" badge. */
export async function verify(file: string | Buffer, solana_tx: string): Promise<VerifyResult> {
  const actual = hash_document(file);
  try { const { rec, blockTime } = await fetchRecord(solana_tx); return compareRecord(actual, rec, blockTime); }
  catch (e) { return { status: "not-found", reason: `chain lookup failed: ${(e as Error).message}` }; }
}

/** Same check for a consent/revoke hash that the API recomputes from its database. */
export async function verifyHash(hash: string, solana_tx: string): Promise<VerifyResult> {
  try { const { rec, blockTime } = await fetchRecord(solana_tx); return compareRecord(hash, rec, blockTime); }
  catch (e) { return { status: "not-found", reason: `chain lookup failed: ${(e as Error).message}` }; }
}
