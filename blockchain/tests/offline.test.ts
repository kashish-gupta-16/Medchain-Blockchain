import { test } from "node:test"; import assert from "node:assert";
import { hash_document, hash_consent, hash_revoke } from "../client/hash_document.js";
import { buildMemo, parseMemo } from "../client/memo.js";
import { compareRecord } from "../client/verify.js";

test("same bytes -> same hash; one changed byte -> different hash", () => {
  assert.equal(hash_document(Buffer.from("abc")), hash_document(Buffer.from("abc")));
  assert.notEqual(hash_document(Buffer.from("abc")), hash_document(Buffer.from("abd")));
});
test("memo round trip", () => {
  const h = hash_document(Buffer.from("x")); const m = parseMemo(buildMemo("DOC", "doc_1", h, 1700000000));
  assert.deepEqual(m, { type: "DOC", id: "doc_1", hash: h, ts: 1700000000 });
});
test("memo rejects names/PII-looking ids", () => {
  assert.throws(() => buildMemo("DOC", "Ramesh Kumar 9876543210", "a".repeat(64)));
});
test("tampered file -> mismatch, original -> verified, junk -> not-found", () => {
  const rec = parseMemo(buildMemo("DOC", "doc_1", hash_document(Buffer.from("original")), 1700000000));
  assert.equal(compareRecord(hash_document(Buffer.from("original")), rec).status, "verified");
  assert.equal(compareRecord(hash_document(Buffer.from("original!")), rec).status, "mismatch");
  assert.equal(compareRecord("0".repeat(64), null).status, "not-found");
});
test("consent and revoke hashes differ and are deterministic", () => {
  const c = { consent_grant_id: "g1", patient_id_token: "pt_1", accessor_id: "dr_1", granted_at: "2026-10-31T10:00:00Z", expires_at: "2026-11-30T10:00:00Z" };
  assert.equal(hash_consent(c), hash_consent({ ...c }));
  assert.notEqual(hash_consent(c), hash_revoke({ consent_grant_id: "g1", patient_id_token: "pt_1", accessor_id: "dr_1", revoked_at: "2026-11-01T10:00:00Z" }));
});
