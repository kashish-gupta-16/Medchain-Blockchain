// On-chain record format:  medchain:v1|TYPE|record_id|sha256hex|unix_ts
export type RecordType = "DOC" | "CONSENT" | "REVOKE" | "ACCESS";
export interface ChainRecord { type: RecordType; id: string; hash: string; ts: number }

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function buildMemo(type: RecordType, id: string, hash: string, ts = Math.floor(Date.now() / 1000)): string {
  if (!SAFE_ID.test(id)) throw new Error("record id must be a pseudonymous id: letters, digits, _ or - (max 64)");
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error("hash must be 64 hex chars (sha-256)");
  return `medchain:v1|${type}|${id}|${hash}|${ts}`;
}

export function parseMemo(s: string): ChainRecord | null {
  const p = s.split("|");
  if (p.length !== 5 || p[0] !== "medchain:v1") return null;
  if (!["DOC", "CONSENT", "REVOKE", "ACCESS"].includes(p[1])) return null;
  return { type: p[1] as RecordType, id: p[2], hash: p[3], ts: Number(p[4]) };
}
