// In-memory stand-in for Solana, used by the offline tests.
import type { Chain, TxState } from "../client/chain.js";

export const OUR_WALLET = "MedChainWa11et1111111111111111111111111111111";
let n = 0;
const fakeSig = () => (`5${String(++n).padStart(6, "1")}` + "Kq".repeat(40)).slice(0, 88);

interface Tx { signature: string; memo: string; signer: string; landed: boolean; failed: boolean; lvbh: number; blockTime: number }

export class FakeChain implements Chain {
  txs: Tx[] = [];
  height = 100;
  submitDelayMs = 0;
  /** Land transactions immediately (true) or only when land() is called (false). */
  autoLand = true;
  down = false;
  submits = 0;

  async submit(memo: string) {
    if (this.down) throw new Error("devnet unreachable");
    this.submits++;
    if (this.submitDelayMs) await new Promise(r => setTimeout(r, this.submitDelayMs));
    const t: Tx = { signature: fakeSig(), memo, signer: OUR_WALLET, landed: this.autoLand, failed: false, lvbh: this.height + 150, blockTime: 1762000000 + n };
    this.txs.push(t);
    return { signature: t.signature, lastValidBlockHeight: t.lvbh };
  }
  /** Add a transaction someone else signed that mentions our wallet. */
  plantForeign(memo: string) {
    const t: Tx = { signature: fakeSig(), memo, signer: "Attacker111111111111111111111111111111111111", landed: true, failed: false, lvbh: 0, blockTime: 1 };
    this.txs.push(t); return t.signature;
  }
  land() { for (const t of this.txs) t.landed = true; }
  drop() { this.txs = this.txs.filter(t => t.landed); }
  get memosOnChain() { return this.txs.filter(t => t.landed && t.signer === OUR_WALLET).map(t => t.memo); }

  async statuses(sigs: string[]): Promise<TxState[]> {
    if (this.down) throw new Error("devnet unreachable");
    return sigs.map(s => { const t = this.txs.find(x => x.signature === s); return !t || !t.landed ? "unknown" : t.failed ? "failed" : "confirmed"; });
  }
  async blockHeight() { return this.height; }
  async listMemos({ limit, before, until }: { limit: number; before?: string; until?: string }) {
    if (this.down) throw new Error("devnet unreachable");
    let list = this.txs.filter(t => t.landed).reverse();
    if (until) { const i = list.findIndex(t => t.signature === until); if (i >= 0) list = list.slice(0, i); }
    if (before) { const i = list.findIndex(t => t.signature === before); list = list.slice(i + 1); }
    return list.slice(0, limit).map(t => ({ signature: t.signature, memo: `[${t.memo.length}] ${t.memo}`, failed: t.failed }));
  }
  async fetchTx(sig: string) {
    if (this.down) throw new Error("devnet unreachable");
    const t = this.txs.find(x => x.signature === sig && x.landed);
    return t ? { signer: t.signer, memos: [t.memo], blockTime: t.blockTime } : null;
  }
}
