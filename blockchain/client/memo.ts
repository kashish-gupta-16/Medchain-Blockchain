// On-chain record format (v2):  medchain:v2|TYPE|sha256hex
// Only a type and a hash go on chain. IDs and timestamps stay in our service / the backend DB.
// v1 memos (medchain:v1|TYPE|id|hash|ts, written during early testing) can still be read.
export type RecordType = "DOC" | "CONSENT" | "REVOKE" | "ACCESS";
export const RECORD_TYPES: readonly RecordType[] = ["DOC", "CONSENT", "REVOKE", "ACCESS"];
export interface ChainRecord { type: RecordType; hash: string; version: 1 | 2; id?: string; ts?: number }

const HEX64 = /^[0-9a-f]{64}$/;
const isType = (t: string): t is RecordType => (RECORD_TYPES as readonly string[]).includes(t);

export function buildMemo(type: RecordType, hash: string): string {
  if (!isType(type)) throw new Error(`unknown record type ${type}`);
  if (!HEX64.test(hash)) throw new Error("hash must be 64 lowercase hex chars (sha-256)");
  return `medchain:v2|${type}|${hash}`;
}

export function parseMemo(s: string): ChainRecord | null {
  const p = s.trim().split("|");
  if (p[0] === "medchain:v2" && p.length === 3 && isType(p[1]) && HEX64.test(p[2]))
    return { type: p[1], hash: p[2], version: 2 };
  if (p[0] === "medchain:v1" && p.length === 5 && isType(p[1]) && HEX64.test(p[3]) && /^\d+$/.test(p[4]))
    return { type: p[1], id: p[2], hash: p[3], ts: Number(p[4]), version: 1 };
  return null;
}

/** getSignaturesForAddress returns memos as "[61] medchain:v2|..." (several joined by "; "). */
export function parseSignatureMemo(m: string | null | undefined): ChainRecord[] {
  if (!m) return [];
  return m.split("; ").map(part => parseMemo(part.replace(/^\[\d+\]\s*/, ""))).filter((r): r is ChainRecord => !!r);
}
