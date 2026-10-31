// Security tests run against Member 1's API. Run: API_URL=http://localhost:8000 npm test (from security/tests)
// ADAPT the ROUTES + seed helpers below to the real API. Tests skip if API_URL is unset.
import { test } from "node:test"; import assert from "node:assert";

const API = process.env.API_URL; const skip = !API;
const ROUTES = {
  login: "/auth/login", readRecord: (patientId: string) => `/patients/${patientId}/documents`,
  grant: "/consents", revoke: (id: string) => `/consents/${id}/revoke`, upload: "/documents",
};
const j = (path: string, init: RequestInit & { token?: string } = {}) =>
  fetch(API + path, { ...init, headers: { "Content-Type": "application/json", ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}), ...init.headers } });

// TODO(Member1): seed helpers that create test patients/doctors and return tokens + ids.
declare function seed(): Promise<{ doctorA: string; doctorB: string; patient1: string; patient2: string; patientTok: string; consentId: string }>;

test("no consent -> read rejected", { skip }, async () => {
  const s = await seed(); const r = await j(ROUTES.readRecord(s.patient2), { token: s.doctorA });
  assert.ok([401, 403].includes(r.status));
});
test("expired consent -> rejected", { skip }, async () => {
  const s = await seed(); /* TODO: grant with expires_at in the past (or advance clock) */
  const r = await j(ROUTES.readRecord(s.patient1), { token: s.doctorA }); assert.equal(r.status, 403);
});
test("revoked consent -> rejected immediately", { skip }, async () => {
  const s = await seed(); await j(ROUTES.revoke(s.consentId), { method: "POST", token: s.patientTok });
  const r = await j(ROUTES.readRecord(s.patient1), { token: s.doctorA }); assert.equal(r.status, 403);
});
test("doctor cannot read another patient's data", { skip }, async () => {
  const s = await seed(); const r = await j(ROUTES.readRecord(s.patient2), { token: s.doctorB });
  assert.ok([403, 404].includes(r.status));
});
test("disallowed upload types rejected (.exe, .html, .svg)", { skip }, async () => {
  const s = await seed();
  for (const [name, type] of [["x.exe", "application/octet-stream"], ["x.html", "text/html"], ["x.svg", "image/svg+xml"]]) {
    const fd = new FormData(); fd.append("file", new Blob(["<script>alert(1)</script>"], { type }), name);
    const r = await fetch(API + ROUTES.upload, { method: "POST", body: fd, headers: { Authorization: `Bearer ${s.patientTok}` } });
    assert.ok([400, 415, 422].includes(r.status), `${name} got ${r.status}`);
  }
});
test("hash mismatch detected after file edit (chain service)", { skip: !process.env.CHAIN_URL }, async () => {
  const h = { "Content-Type": "application/json", "X-API-Key": process.env.CHAIN_KEY ?? "" };
  const file = Buffer.from("report v1").toString("base64");
  const w = await (await fetch(process.env.CHAIN_URL + "/document", { method: "POST", headers: h, body: JSON.stringify({ document_id: "doc_sectest", file_base64: file }) })).json();
  assert.ok(w.solana_tx, "needs devnet access");
  const v = await (await fetch(process.env.CHAIN_URL + "/verify", { method: "POST", headers: h, body: JSON.stringify({ solana_tx: w.solana_tx, file_base64: Buffer.from("report v1 EDITED").toString("base64") }) })).json();
  assert.equal(v.status, "mismatch");
});
