// Anchoring + HTTP behaviour the backend relies on (blockchain-integration.md), run against a fake chain.
import { test } from "node:test"; import assert from "node:assert";
import type { AddressInfo } from "net";
import { FakeChain, OUR_WALLET } from "./fake-chain.js";
import { createService } from "../client/service.js";
import { Store } from "../client/store.js";
import { createApp } from "../client/server.js";
import { hash_document } from "../client/hash_document.js";

const quiet = () => {};
const fast = { confirmWaitMs: 300, pollMs: 50, budgetMs: 1500, log: quiet };
const mk = (chain = new FakeChain(), store = new Store()) => createService({ chain, store, trustedSigner: OUR_WALLET, anchor: fast });
const h = (s: string) => hash_document(Buffer.from(s));

test("confirmed write returns solana_tx; repeat request returns the same tx without a new memo", async () => {
  const chain = new FakeChain(); const svc = mk(chain);
  const a = await svc.anchor("DOC", "d1", h("file"));
  assert.equal(a.status, "confirmed"); assert.ok(a.solana_tx);
  const b = await svc.anchor("DOC", "d1", h("file"));
  assert.equal(b.solana_tx, a.solana_tx);
  assert.equal(chain.submits, 1);
});

test("concurrent duplicates share one submission", async () => {
  const chain = new FakeChain(); chain.submitDelayMs = 100; const svc = mk(chain);
  const rs = await Promise.all([1, 2, 3].map(() => svc.anchor("CONSENT", "g1", h("c"))));
  assert.equal(new Set(rs.map(r => r.solana_tx)).size, 1);
  assert.equal(chain.submits, 1);
});

test("slow confirmation -> immediate chain_pending + queue_id, then /status reports the signature", async () => {
  const chain = new FakeChain(); chain.autoLand = false; const svc = mk(chain);
  const t0 = Date.now();
  const a = await svc.anchor("DOC", "d2", h("slow"));
  assert.ok(Date.now() - t0 < 1500, "must answer well inside the backend's 8 s");
  assert.equal(a.status, "chain_pending"); assert.ok(a.queue_id); assert.equal(a.solana_tx, undefined);
  assert.deepEqual(await svc.anchorer.status(a.queue_id!), { status: "chain_pending", solana_tx: null });
  chain.land(); await svc.anchorer.tick();
  const s = await svc.anchorer.status(a.queue_id!);
  assert.equal(s?.status, "confirmed"); assert.ok(s?.solana_tx);
  assert.equal(chain.submits, 1, "pending tx was confirmed, not re-sent");
});

test("devnet down -> chain_pending; retry after recovery writes exactly one memo", async () => {
  const chain = new FakeChain(); chain.down = true; const svc = mk(chain);
  const a = await svc.anchor("REVOKE", "g1", h("rev"));
  assert.equal(a.status, "chain_pending");
  await svc.anchorer.tick(); // still down
  chain.down = false; await svc.anchorer.tick(); await svc.anchorer.tick();
  assert.equal((await svc.anchorer.status(a.queue_id!))?.status, "confirmed");
  assert.equal(chain.memosOnChain.length, 1);
});

test("dropped tx is re-sent only after its blockhash expires (never two memos)", async () => {
  const chain = new FakeChain(); chain.autoLand = false; const svc = mk(chain);
  const a = await svc.anchor("ACCESS", "l1", h("log"));
  chain.drop();                       // RPC lost it
  await svc.anchorer.tick(); assert.equal(chain.submits, 1, "not yet expired: wait");
  chain.height += 1000; chain.autoLand = true;
  await svc.anchorer.tick();          // marks expired
  await svc.anchorer.tick();          // re-sends
  assert.equal(chain.submits, 2); assert.equal(chain.memosOnChain.length, 1);
  assert.equal((await svc.anchorer.status(a.queue_id!))?.status, "confirmed");
});

test("after a restart (empty store) a resend finds the existing on-chain record", async () => {
  const chain = new FakeChain();
  const first = await mk(chain).anchor("DOC", "d3", h("persist"));
  const restarted = mk(chain, new Store());
  await restarted.anchorer.indexReady;
  const again = await restarted.anchor("DOC", "d3", h("persist"));
  assert.equal(again.solana_tx, first.solana_tx); assert.equal(chain.submits, 1);
});

test("a memo planted by another wallet is not mistaken for ours", async () => {
  const chain = new FakeChain(); const hash = h("spoof");
  const fake = chain.plantForeign(`medchain:v2|DOC|${hash}`);
  const svc = mk(chain); await svc.anchorer.indexReady;
  const r = await svc.anchor("DOC", "d4", hash);
  assert.notEqual(r.solana_tx, fake); assert.equal(chain.submits, 1);
  assert.equal((await svc.verifier.verifyDocument(Buffer.from("spoof"), fake)).status, "not-found");
});

test("no lost records: writes arriving while the retry job runs are kept", async () => {
  const chain = new FakeChain(); chain.down = true; const svc = mk(chain);
  await svc.anchor("DOC", "a", h("A"));
  const ticking = svc.anchorer.tick();
  await svc.anchor("DOC", "b", h("B"));
  await ticking;
  assert.equal(svc.store.pending().length, 2);
});

test("verify: original verified, tampered mismatch, consent tx can't verify a document", async () => {
  const svc = mk();
  const doc = await svc.anchor("DOC", "d5", h("report v1"));
  assert.equal((await svc.verifier.verifyDocument(Buffer.from("report v1"), doc.solana_tx!)).status, "verified");
  assert.equal((await svc.verifier.verifyDocument(Buffer.from("report v1 EDITED"), doc.solana_tx!)).status, "mismatch");
  const c = await svc.anchor("CONSENT", "g9", h("report v1"));
  assert.equal((await svc.verifier.verifyDocument(Buffer.from("report v1"), c.solana_tx!)).status, "not-found");
});

// ---------- HTTP ----------
const KEY = "test-key-0123456789abcdef";
async function withServer(fn: (call: (path: string, init?: RequestInit & { key?: string | null }) => Promise<Response>, chain: FakeChain) => Promise<void>) {
  const chain = new FakeChain();
  const app = createApp({ apiKey: KEY, service: mk(chain), log: quiet });
  await new Promise<void>(r => app.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  const call = (path: string, init: RequestInit & { key?: string | null } = {}) => fetch(base + path, {
    ...init, headers: { "Content-Type": "application/json", ...(init.key === null ? {} : { "X-API-Key": init.key ?? KEY }) },
  });
  try { await fn(call, chain); } finally { app.close(); }
}
const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

test("server refuses to start without a real API key", () => {
  for (const k of ["", "change-me", "short"]) assert.throws(() => createApp({ apiKey: k, service: mk(), log: quiet }));
});

test("HTTP: auth on every route, /health open, healthcheck probe gets 404", async () => {
  await withServer(async call => {
    assert.equal((await call("/health", { key: null })).status, 200);
    for (const [p, init] of [["/consent", post({})], ["/status/healthcheck-probe", {}], ["/retry", post({})]] as const) {
      assert.equal((await call(p, { ...init, key: null })).status, 401, `${p} without key`);
      const wrong = await call(p, { ...init, key: "wrong-key-wrong-key" });
      assert.equal(wrong.status, 401); assert.deepEqual(await wrong.json(), { error: "unauthorized" });
    }
    assert.equal((await call("/status/healthcheck-probe")).status, 404);
  });
});

test("HTTP: 15 MB document accepted, hash matches backend doc_hash, duplicate returns same tx", async () => {
  await withServer(async (call, chain) => {
    const file = Buffer.alloc(11 * 1024 * 1024, 7); // ~14.7 MB as base64
    const body = { document_id: "6724f1c2a9e3b1d4c5e6f7a8", file_base64: file.toString("base64") };
    const r1 = await (await call("/document", post(body))).json();
    assert.equal(r1.status, "confirmed"); assert.equal(r1.hash, hash_document(file)); assert.ok(r1.solana_tx);
    const r2 = await (await call("/document", post(body))).json();
    assert.equal(r2.solana_tx, r1.solana_tx); assert.equal(chain.submits, 1);
    const v = await (await call("/verify", post({ file_base64: file.toString("base64"), solana_tx: r1.solana_tx }))).json();
    assert.equal(v.status, "verified"); assert.match(v.timestamp, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  });
});

test("HTTP: oversized body -> 413, bad input -> 400, unknown queue -> 404", async () => {
  await withServer(async call => {
    const big = await call("/document", post({ document_id: "d", file_base64: "A".repeat(21 * 1024 * 1024) }));
    assert.equal(big.status, 413);
    assert.equal((await call("/consent", post({}))).status, 400);
    assert.equal((await call("/consent", { method: "POST", body: "{not json" })).status, 400);
    assert.equal((await call("/status/doc_" + "0".repeat(64))).status, 404);
  });
});

test("HTTP: consent -> verify-consent round trip; revoke before consent is accepted", async () => {
  await withServer(async call => {
    const consent = { consent_grant_id: "9b2e5c1a-1111-4222-8333-000000000009", patient_id_token: "33333333-3333-4333-8333-000000000001",
      accessor_id: "22222222-2222-4222-8222-000000000002", granted_at: "2026-11-01T10:00:00Z", expires_at: "2026-11-02T10:00:00Z" };
    const { granted_at, expires_at, ...ids } = consent;
    const rv = await (await call("/revoke", post({ ...ids, revoked_at: "2026-11-01T12:30:00Z" }))).json();
    assert.equal(rv.status, "confirmed");
    const c = await (await call("/consent", post(consent))).json();
    const ok = await (await call("/verify-consent", post({ consent, solana_tx: c.solana_tx }))).json();
    assert.equal(ok.status, "verified");
    const bad = await (await call("/verify-consent", post({ consent: { ...consent, expires_at: "2026-11-03T10:00:00Z" }, solana_tx: c.solana_tx }))).json();
    assert.equal(bad.status, "mismatch");
  });
});
