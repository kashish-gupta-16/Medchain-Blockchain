// HTTP service the backend calls (see contracts/chain-records.md).
// Auth: X-API-Key on every route except /health. Files arrive as base64 JSON (up to ~15 MB).
// Bodies are never logged: they contain medical documents.
import { createServer as httpServer, IncomingMessage, Server, ServerResponse } from "http";
import { createHash, timingSafeEqual } from "crypto";
import { pathToFileURL } from "url";
import { loadKeypair, trustedPubkey } from "./config";
import { createService, Service } from "./service";
import { hash_access_log, hash_consent, hash_document, hash_revoke } from "./hash_document";
import { parseAccessLog, parseConsent, parseDocument, parseRevoke, parseVerify, parseVerifyConsent, ValidationError } from "./validate";

export const MAX_BODY_BYTES = 20 * 1024 * 1024; // backend sends up to ~15 MB of base64

class HttpError extends Error { constructor(readonly status: number, msg: string) { super(msg); } }


function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const declaredTooBig =
      Number(req.headers["content-length"] ?? 0) > limit;

    const chunks: Buffer[] = [];
    let size = 0;
    let tooBig = declaredTooBig;

    req.on("data", (c: Buffer) => {
      size += c.length;

      if (size > limit) {
        tooBig = true;
      }

      if (!tooBig) {
        chunks.push(c);
      }
    });

    req.on("error", reject);

    req.on("end", () => {
      if (tooBig) {
        return reject(
          new HttpError(413, `body larger than ${limit} bytes`)
        );
      }

      const text = Buffer.concat(chunks).toString("utf8");

      if (!text) return resolve({});

      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new HttpError(400, "body is not valid JSON"));
      }
    });
  });
}


const digest = (s: string) => createHash("sha256").update(s).digest();
function keyMatches(given: string | string[] | undefined, expected: string) {
  return typeof given === "string" && timingSafeEqual(digest(given), digest(expected));
}

export function validateApiKey(key: string | undefined): string {
  if (!key || key === "change-me" || key.length < 16)
    throw new Error("CHAIN_SERVICE_API_KEY must be set to a random value of at least 16 characters (e.g. openssl rand -hex 32)");
  return key;
}

export function createApp(opts: { apiKey: string; service: Service; maxBodyBytes?: number; log?: (s: string) => void }): Server {
  const apiKey = validateApiKey(opts.apiKey);
  const { anchorer, verifier } = opts.service;
  const limit = opts.maxBodyBytes ?? MAX_BODY_BYTES;
  const log = opts.log ?? console.log;

  async function route(req: IncomingMessage, path: string): Promise<[number, unknown]> {
    if (path === "/health") return [200, { ok: true }];
    if (!keyMatches(req.headers["x-api-key"], apiKey)) { req.resume(); return [401, { error: "unauthorized" }]; }

    if (path.startsWith("/status/")) {
      if (req.method !== "GET") return [405, { error: "use GET" }];
      const s = await anchorer.status(decodeURIComponent(path.slice("/status/".length)));
      return s ? [200, s] : [404, { error: "unknown queue_id" }];
    }
    const routes = ["/document", "/consent", "/revoke", "/access-log", "/verify", "/verify-consent", "/retry"];
    if (!routes.includes(path)) { req.resume(); return [404, { error: "not found" }]; }
    if (req.method !== "POST") { req.resume(); return [405, { error: "use POST" }]; }

    const b = await readJson(req, limit);
    switch (path) {
      case "/document": { const d = parseDocument(b); return [200, await anchorer.anchor("DOC", d.document_id, hash_document(d.bytes))]; }
      case "/consent": { const c = parseConsent(b); return [200, await anchorer.anchor("CONSENT", c.consent_grant_id, hash_consent(c))]; }
      case "/revoke": { const r = parseRevoke(b); return [200, await anchorer.anchor("REVOKE", r.consent_grant_id, hash_revoke(r))]; }
      case "/access-log": { const e = parseAccessLog(b); return [200, await anchorer.anchor("ACCESS", e.log_id, hash_access_log(e))]; }
      case "/verify": { const v = parseVerify(b); return [200, await verifier.verifyDocument(v.bytes, v.solana_tx)]; }
      case "/verify-consent": { const v = parseVerifyConsent(b); return [200, await verifier.verifyConsent(v.consent, v.solana_tx)]; }
      default: return [200, await anchorer.tick()]; // /retry
    }
  }

  return httpServer(async (req: IncomingMessage, res: ServerResponse) => {
    const started = Date.now();
    const path = new URL(req.url ?? "/", "http://x").pathname.replace(/\/+$/, "") || "/";
    let code = 500; let out: unknown = { error: "internal error" };
    try { [code, out] = await route(req, path); }
    catch (e) {
      if (e instanceof ValidationError || e instanceof HttpError) { code = e.status; out = { error: e.message }; }
      else log(`error on ${req.method} ${path}: ${(e as Error).message}`);
    }
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (code === 413) headers.Connection = "close";
    res.writeHead(code, headers); res.end(JSON.stringify(out));
    log(`${req.method} ${path} ${code} ${Date.now() - started}ms`); // ids/hashes only, never bodies
  });
}

async function main() {
  let apiKey: string;
  try {
    apiKey = validateApiKey(process.env.CHAIN_SERVICE_API_KEY);
    const wallet = loadKeypair().publicKey.toBase58();
    if (trustedPubkey() !== wallet) throw new Error(`MEDCHAIN_WALLET_PUBKEY (${trustedPubkey()}) does not match the wallet key (${wallet})`);
  } catch (e) { console.error(`Startup failed: ${(e as Error).message}`); process.exit(1); }

  const service = createService();
  const app = createApp({ apiKey, service });
  const port = Number(process.env.PORT || process.env.CHAIN_SERVICE_PORT || 4010);
  const host = process.env.HOST || "0.0.0.0"; // Render needs 0.0.0.0; set HOST=127.0.0.1 for local-only
  app.requestTimeout = 30_000;
  app.listen(port, host, () => console.log(`MedChain chain service on ${host}:${port} (wallet ${trustedPubkey()})`));

  const every = Number(process.env.CHAIN_WORKER_INTERVAL_MS || 15_000);
  setInterval(() => { service.anchorer.tick().catch(() => {}); }, every).unref();
  for (const sig of ["SIGTERM", "SIGINT"] as const)
    process.on(sig, () => { service.store.flush(); app.close(); process.exit(0); });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
