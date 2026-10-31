// Small HTTP service so Python/Node backends can call the chain layer.
// Auth: X-API-Key header. Files are sent as base64 (hackathon-simple).
import { createServer, IncomingMessage } from "http";
import "dotenv/config";
import { write_hash, retryPending } from "./write_hash.js";
import { write_consent, write_revoke, write_access_log } from "./write_consent.js";
import { verify, verifyHash } from "./verify.js";
import { hash_consent } from "./hash_document.js";
import { getItem } from "./queue.js";

const KEY = process.env.CHAIN_SERVICE_API_KEY; const PORT = Number(process.env.CHAIN_SERVICE_PORT ?? 4010);
if (!KEY || KEY === "change-me") console.warn("WARNING: set CHAIN_SERVICE_API_KEY in .env");

const body = (req: IncomingMessage) => new Promise<any>((res, rej) => {
  let d = ""; req.on("data", c => { d += c; if (d.length > 30e6) req.destroy(); });
  req.on("end", () => { try { res(d ? JSON.parse(d) : {}); } catch (e) { rej(e); } });
});

createServer(async (req, res) => {
  const send = (code: number, obj: unknown) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  try {
    if (req.url === "/health") return send(200, { ok: true });
    if (req.headers["x-api-key"] !== KEY) return send(401, { error: "unauthorized" });
    const url = req.url ?? "";
    if (req.method === "GET" && url.startsWith("/status/")) { const it = getItem(url.split("/")[2]); return it ? send(200, { solana_tx: it.solana_tx ?? null, status: it.solana_tx ? "confirmed" : "chain_pending" }) : send(404, { error: "unknown queue_id" }); }
    if (req.method !== "POST") return send(405, { error: "method" });
    const b = await body(req);
    switch (url) {
      case "/document":  return send(200, await write_hash(b.document_id, Buffer.from(b.file_base64, "base64")));
      case "/consent":   return send(200, await write_consent(b));
      case "/revoke":    return send(200, await write_revoke(b));
      case "/access-log":return send(200, await write_access_log(b));
      case "/verify":    return send(200, await verify(Buffer.from(b.file_base64, "base64"), b.solana_tx));
      case "/verify-consent": return send(200, await verifyHash(hash_consent(b.consent), b.solana_tx));
      case "/retry":     return send(200, await retryPending());
      default: return send(404, { error: "not found" });
    }
  } catch (e) { send(400, { error: (e as Error).message }); }
}).listen(PORT, () => console.log(`MedChain chain service on :${PORT}`));

setInterval(() => retryPending().catch(() => {}), 60_000); // auto-retry pending writes
