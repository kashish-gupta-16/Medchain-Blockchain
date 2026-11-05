import { ChainRecord, parseMemo, RecordType } from "./memo.js";
import { hash_document, hash_consent, ConsentFields } from "./hash_document.js";
import { Chain, withTimeout } from "./chain.js";

export interface VerifyResult {
  status: "verified" | "mismatch" | "not-found";
  timestamp?: string; record_type?: RecordType; expected_hash?: string; actual_hash?: string;
  solana_tx?: string; reason?: string;
}

const iso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");

/** Pure comparison (easy to unit test). The record must be of the expected type (a DOC tx can't verify a consent). */
export function compareRecord(actualHash: string, rec: ChainRecord | null, expectedType: RecordType, blockTime?: number | null): VerifyResult {
  if (!rec) return { status: "not-found", reason: "no MedChain record signed by our wallet in this transaction" };
  if (rec.type !== expectedType)
    return { status: "not-found", reason: `transaction holds a ${rec.type} record, not ${expectedType}` };
  const t = blockTime ?? rec.ts;
  const base = { timestamp: t ? iso(t) : undefined, record_type: rec.type, expected_hash: rec.hash, actual_hash: actualHash };
  return actualHash === rec.hash
    ? { status: "verified", ...base }
    : { status: "mismatch", ...base, reason: "content changed after it was recorded" };
}

export class Verifier {
  private cache = new Map<string, { recs: ChainRecord[]; blockTime?: number | null; foreign: boolean }>();
  constructor(private chain: Chain, private trustedSigner: string, private timeoutMs = 6000) {}

  private async lookup(sig: string) {
    const hit = this.cache.get(sig);
    if (hit) return hit;
    const tx = await withTimeout(this.chain.fetchTx(sig), this.timeoutMs, "chain lookup");
    if (!tx) return null; // not visible (yet): don't cache
    const foreign = tx.signer !== this.trustedSigner;
    const entry = { recs: foreign ? [] : tx.memos.map(parseMemo).filter((r): r is ChainRecord => !!r), blockTime: tx.blockTime, foreign };
    if (this.cache.size > 5000) this.cache.clear();
    this.cache.set(sig, entry); // confirmed transactions never change
    return entry;
  }

  async verifyHash(type: RecordType, actualHash: string, solana_tx: string): Promise<VerifyResult> {
    try {
      const tx = await this.lookup(solana_tx);
      if (!tx) return { status: "not-found", solana_tx, reason: "transaction not found on chain" };
      if (tx.foreign) return { status: "not-found", solana_tx, reason: "transaction not signed by the MedChain wallet" };
      const rec = tx.recs.find(r => r.type === type) ?? tx.recs[0] ?? null;
      return { ...compareRecord(actualHash, rec, type, tx.blockTime), solana_tx };
    } catch (e) {
      return { status: "not-found", solana_tx, reason: `chain lookup failed: ${(e as Error).message}` };
    }
  }

  /** Re-hash the decoded file bytes, fetch the on-chain record, compare. Powers the "Verified" badge. */
  verifyDocument(file: string | Buffer, solana_tx: string) { return this.verifyHash("DOC", hash_document(file), solana_tx); }
  verifyConsent(c: ConsentFields, solana_tx: string) { return this.verifyHash("CONSENT", hash_consent(c), solana_tx); }
}
