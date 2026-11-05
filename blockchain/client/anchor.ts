// Writes record hashes to the chain without ever making the caller wait more than a few seconds,
// and without ever writing the same record twice.
//
//  * Idempotent: records are keyed by TYPE:hash. A repeat request returns the existing solana_tx (or queue_id).
//    Two identical requests arriving at once share one submission.
//  * Restart-safe: on startup we index our wallet's past memos from the chain, so a resend after a restart
//    (Render free tier has no persistent disk) still finds the existing transaction.
//  * Fast: we submit, wait up to `confirmWaitMs` for confirmation, then reply chain_pending + queue_id.
//    The background tick() finishes the job; GET /status/:queue_id reports the signature.
//  * No double memos: a sent transaction is only re-sent once its blockhash has expired and it is still
//    not on chain, so it can never land twice.
import { buildMemo, parseMemo, parseSignatureMemo, RecordType, RECORD_TYPES } from "./memo.js";
import { Store, StoredRecord } from "./store";
import { Chain, sleep, withTimeout } from "./chain";

export interface AnchorResult { status: "confirmed" | "chain_pending"; solana_tx?: string; queue_id?: string; hash: string }
export interface StatusResult { status: "confirmed" | "chain_pending"; solana_tx: string | null }

export interface AnchorOptions {
  trustedSigner: string;
  budgetMs?: number;        // total time one request may spend on the chain (backend timeout is 8 s)
  confirmWaitMs?: number;   // how long to wait for confirmation before replying chain_pending
  pollMs?: number;
  indexPages?: number;      // pages of 1000 signatures scanned at startup
  log?: (msg: string) => void;
}

export const keyFor = (type: RecordType, hash: string) => `${type}:${hash}`;
export const queueIdFor = (type: RecordType, hash: string) => `${type.toLowerCase()}_${hash}`;
export function parseQueueId(q: string): { type: RecordType; hash: string } | null {
  const m = /^([a-z]+)_([0-9a-f]{64})$/.exec(q);
  const type = m?.[1].toUpperCase() as RecordType | undefined;
  return m && type && RECORD_TYPES.includes(type) ? { type, hash: m[2] } : null;
}

export class Anchorer {
  private inflight = new Map<string, Promise<AnchorResult>>();
  private submitting = new Set<string>();
  private chainIndex = new Map<string, string>();     // TYPE:hash -> signature seen in our wallet history
  private verifiedSigs = new Set<string>();           // signatures confirmed to be signed by our wallet
  private newestSeen?: string;
  private ticking = false;
  readonly indexReady: Promise<void>;
  private o: Required<AnchorOptions>;

  constructor(private chain: Chain, private store: Store, opts: AnchorOptions) {
    this.o = { budgetMs: 6000, confirmWaitMs: 4000, pollMs: 500, indexPages: 3, log: console.log, ...opts };
    this.indexReady = this.refreshIndex(this.o.indexPages).catch(e => this.o.log(`chain index: ${e.message}`));
  }

  /** Anchor one record. Never throws for chain problems; returns confirmed or chain_pending. */
  anchor(type: RecordType, record_id: string, hash: string): Promise<AnchorResult> {
    buildMemo(type, hash); // validates type + hash
    const key = keyFor(type, hash);
    const running = this.inflight.get(key);
    if (running) return running;
    const p = this.doAnchor(type, record_id, hash, key).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async doAnchor(type: RecordType, record_id: string, hash: string, key: string): Promise<AnchorResult> {
    const deadline = Date.now() + this.o.budgetMs;
    let rec = this.store.get(key);
    if (rec?.status === "confirmed") return this.result(rec);
    if (!rec) {
      await withTimeout(this.indexReady, Math.min(2000, deadline - Date.now())).catch(() => {});
      const known = await this.knownOnChain(key, deadline);
      const now = new Date().toISOString();
      rec = { key, type, hash, record_id, status: known ? "confirmed" : "pending", signature: known, attempts: 0, created_at: now, updated_at: now };
      this.store.put(rec);
      if (known) return this.result(rec);
    }
    if (!rec.signature) await this.submit(rec, deadline);
    if (rec.signature) await this.waitConfirmed(rec, Math.min(deadline, Date.now() + this.o.confirmWaitMs));
    return this.result(rec);
  }

  private result(r: StoredRecord): AnchorResult {
    return r.status === "confirmed"
      ? { status: "confirmed", solana_tx: r.signature, hash: r.hash }
      : { status: "chain_pending", queue_id: queueIdFor(r.type, r.hash), hash: r.hash };
  }

  /** Is this record already in our wallet's history? Only trusts transactions actually signed by our wallet. */
  private async knownOnChain(key: string, deadline: number): Promise<string | undefined> {
    const sig = this.chainIndex.get(key);
    if (!sig) return undefined;
    if (this.verifiedSigs.has(sig)) return sig;
    try {
      const tx = await withTimeout(this.chain.fetchTx(sig), deadline - Date.now());
      const ok = !!tx && tx.signer === this.o.trustedSigner &&
        tx.memos.some(m => { const r = parseMemo(m); return !!r && keyFor(r.type, r.hash) === key; });
      if (ok) { this.verifiedSigs.add(sig); return sig; }
      this.chainIndex.delete(key); // someone else's memo that mentions our wallet: ignore
    } catch { /* RPC slow: treat as unknown; tick() will resolve it before re-sending */ }
    return undefined;
  }

  private async submit(rec: StoredRecord, deadline: number) {
    if (this.submitting.has(rec.key)) return;
    this.submitting.add(rec.key);
    const p = this.chain.submit(buildMemo(rec.type, rec.hash)).then(s => {
      // Recorded even if it arrives after we stopped waiting, so a late success is never re-sent.
      rec.signature = s.signature; rec.last_valid_block_height = s.lastValidBlockHeight;
      rec.attempts++; rec.last_error = undefined; this.store.put(rec);
    }, e => { rec.attempts++; rec.last_error = String(e?.message ?? e).slice(0, 200); this.store.put(rec); })
      .finally(() => this.submitting.delete(rec.key));
    await withTimeout(p, deadline - Date.now()).catch(() => {});
  }

  private async waitConfirmed(rec: StoredRecord, until: number) {
    while (rec.signature && rec.status === "pending") {
      try {
        const [s] = await withTimeout(this.chain.statuses([rec.signature]), until - Date.now());
        if (s === "confirmed") { rec.status = "confirmed"; this.store.put(rec); return; }
        if (s === "failed") { this.markFailed(rec, "transaction failed on chain"); return; }
      } catch { return; }
      if (Date.now() + this.o.pollMs >= until) return;
      await sleep(this.o.pollMs);
    }
  }

  private markFailed(rec: StoredRecord, why: string) {
    rec.signature = undefined; rec.last_valid_block_height = undefined; rec.last_error = why; this.store.put(rec);
  }

  /** For GET /status/:queue_id. null = unknown queue_id (404). */
  async status(queue_id: string): Promise<StatusResult | null> {
    const q = parseQueueId(queue_id);
    if (!q) return null;
    const key = keyFor(q.type, q.hash);
    const rec = this.store.get(key);
    if (rec) return { status: rec.status === "confirmed" ? "confirmed" : "chain_pending", solana_tx: rec.status === "confirmed" ? rec.signature! : null };
    const sig = await this.knownOnChain(key, Date.now() + 4000);
    return sig ? { status: "confirmed", solana_tx: sig } : null;
  }

  /** Background job: confirm or (safely) re-send pending records. Safe to call often; runs one at a time. */
  async tick(): Promise<{ processed: number; still_pending: number }> {
    if (this.ticking) return { processed: 0, still_pending: this.store.pending().length };
    this.ticking = true;
    let processed = 0;
    try {
      await this.refreshIndex(1).catch(e => this.o.log(`chain index: ${e.message}`));
      const pending = this.store.pending().filter(r => !this.submitting.has(r.key)).slice(0, 50);
      const sent = pending.filter(r => r.signature);
      if (sent.length) {
        const states = await this.chain.statuses(sent.map(r => r.signature!));
        let height: number | undefined;
        for (const [i, r] of sent.entries()) {
          if (states[i] === "confirmed") { r.status = "confirmed"; this.store.put(r); processed++; continue; }
          if (states[i] === "failed") { this.markFailed(r, "transaction failed on chain"); continue; }
          height ??= await this.chain.blockHeight();
          if (r.last_valid_block_height !== undefined && height > r.last_valid_block_height)
            this.markFailed(r, "blockhash expired before confirmation"); // can no longer land: safe to re-send
        }
      }
      for (const r of pending.filter(r => !r.signature)) {
        const known = await this.knownOnChain(r.key, Date.now() + 4000);
        if (known) { r.signature = known; r.status = "confirmed"; this.store.put(r); processed++; continue; }
        await this.submit(r, Date.now() + 5000);
        if (r.signature) await this.waitConfirmed(r, Date.now() + 2000);
        if (r.status === "confirmed") processed++;
      }
    } catch (e) {
      this.o.log(`tick: ${(e as Error).message}`);
    } finally { this.ticking = false; }
    return { processed, still_pending: this.store.pending().length };
  }

  /** Index memos from our wallet's history (newest first). Pages of 1000 signatures. */
  private async refreshIndex(maxPages: number) {
    let before: string | undefined; let first: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const sigs = await this.chain.listMemos({ limit: 1000, before, until: this.newestSeen });
      if (!sigs.length) break;
      first ??= sigs[0].signature;
      for (const s of sigs) {
        if (s.failed) continue;
        for (const r of parseSignatureMemo(s.memo)) {
          const k = keyFor(r.type, r.hash);
          if (!this.chainIndex.has(k)) this.chainIndex.set(k, s.signature);
        }
      }
      if (sigs.length < 1000) break;
      before = sigs[sigs.length - 1].signature;
    }
    if (first) this.newestSeen = first;
  }

  /** For scripts/tests: wait until a record is confirmed (runs tick() while waiting). */
  async waitFor(queue_id: string, timeoutMs = 60_000): Promise<StatusResult | null> {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const s = await this.status(queue_id);
      if (!s || s.status === "confirmed" || Date.now() > end) return s;
      await this.tick(); await sleep(1000);
    }
  }
}
