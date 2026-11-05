// Records this service has anchored or is anchoring, keyed by TYPE:hash.
// Kept in memory and written to disk synchronously after every change (atomic rename), so there is no
// load -> await -> save window in which another request's update could be lost.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { RecordType } from "./memo.js";

export interface StoredRecord {
  key: string; type: RecordType; hash: string; record_id: string;
  status: "pending" | "confirmed";
  signature?: string; last_valid_block_height?: number;
  attempts: number; last_error?: string; created_at: string; updated_at: string;
}

const MAX_CONFIRMED = 20_000; // older confirmed records are dropped; the chain index still finds them

export class Store {
  private items = new Map<string, StoredRecord>();
  constructor(private file?: string) {
    if (file && existsSync(file)) {
      try { for (const r of JSON.parse(readFileSync(file, "utf8")) as StoredRecord[]) this.items.set(r.key, r); }
      catch (e) { console.error(`store: could not read ${file} (${(e as Error).message}); starting empty`); }
    }
  }
  get(key: string) { return this.items.get(key); }
  put(r: StoredRecord) { r.updated_at = new Date().toISOString(); this.items.set(r.key, r); this.flush(); }
  pending() { return [...this.items.values()].filter(r => r.status === "pending"); }
  all() { return [...this.items.values()]; }

  flush() {
    if (!this.file) return;
    let list = [...this.items.values()];
    const confirmed = list.filter(r => r.status === "confirmed");
    if (confirmed.length > MAX_CONFIRMED) {
      const drop = new Set(confirmed.sort((a, b) => a.updated_at.localeCompare(b.updated_at))
        .slice(0, confirmed.length - MAX_CONFIRMED).map(r => r.key));
      for (const k of drop) this.items.delete(k);
      list = [...this.items.values()];
    }
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(list));
    renameSync(tmp, this.file);
  }
}
