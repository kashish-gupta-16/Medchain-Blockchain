// Tiny file-based retry queue so devnet outages never block the user.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";

const DIR = ".queue"; const FILE = `${DIR}/pending.json`;
export interface QueueItem { queue_id: string; memo: string; created_at: string; attempts: number; solana_tx?: string }

function load(): QueueItem[] { return existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : []; }
function save(items: QueueItem[]) { mkdirSync(DIR, { recursive: true }); writeFileSync(FILE, JSON.stringify(items, null, 2)); }

export function enqueue(memo: string): string {
  const items = load(); const queue_id = randomUUID();
  items.push({ queue_id, memo, created_at: new Date().toISOString(), attempts: 0 }); save(items); return queue_id;
}
export const getItem = (id: string) => load().find(i => i.queue_id === id);

export async function processQueue(send: (memo: string) => Promise<string>) {
  const items = load(); let done = 0;
  for (const it of items) {
    if (it.solana_tx) continue;
    try { it.solana_tx = await send(it.memo); done++; } catch { it.attempts++; }
  }
  save(items); return { processed: done, still_pending: items.filter(i => !i.solana_tx).length };
}
