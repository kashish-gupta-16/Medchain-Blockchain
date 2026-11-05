import { test } from "node:test"; import assert from "node:assert";
import { hash_document, hash_consent, hash_revoke, canonical_consent, sha256Hex } from "../client/hash_document.js";
import { buildMemo, parseMemo, parseSignatureMemo } from "../client/memo.js";
import { compareRecord } from "../client/verify.js";
import { parseConsent, parseAccessLog, parseDocument, ValidationError } from "../client/validate.js";

const consent = {
  consent_grant_id: "9b2e5c1a-1111-4222-8333-000000000009", patient_id_token: "33333333-3333-4333-8333-000000000001",
  accessor_id: "22222222-2222-4222-8222-000000000002", granted_at: "2026-11-01T10:00:00Z", expires_at: "2026-11-02T10:00:00Z",
};

test("same bytes -> same hash; one changed byte -> different hash", () => {
  assert.equal(hash_document(Buffer.from("abc")), hash_document(Buffer.from("abc")));
  assert.notEqual(hash_document(Buffer.from("abc")), hash_document(Buffer.from("abd")));
});

test("document hash = sha256 of decoded bytes, not of the base64 text", () => {
  const bytes = Buffer.from("report v1");
  const d = parseDocument({ document_id: "6724f1c2a9e3b1d4c5e6f7a8", file_base64: bytes.toString("base64") });
  assert.equal(hash_document(d.bytes), sha256Hex(bytes));
  assert.notEqual(hash_document(d.bytes), sha256Hex(bytes.toString("base64")));
});

test("consent hash is canonical: key order, spacing and extra fields don't matter", () => {
  const shuffled = JSON.parse(JSON.stringify({ expires_at: consent.expires_at, accessor_id: consent.accessor_id, extra: "x",
    granted_at: consent.granted_at, patient_id_token: consent.patient_id_token, consent_grant_id: consent.consent_grant_id }));
  assert.equal(hash_consent(parseConsent(shuffled)), hash_consent(parseConsent(consent)));
  assert.equal(canonical_consent(consent),
    `{"consent_grant_id":"${consent.consent_grant_id}","patient_id_token":"${consent.patient_id_token}","accessor_id":"${consent.accessor_id}","granted_at":"2026-11-01T10:00:00Z","expires_at":"2026-11-02T10:00:00Z"}`);
});

test("consent and revoke hashes differ", () => {
  assert.notEqual(hash_consent(consent), hash_revoke({ ...consent, revoked_at: "2026-11-01T12:30:00Z" }));
});

test("validation rejects bad input instead of hashing 'undefined'", () => {
  assert.throws(() => parseConsent({}), ValidationError);
  assert.throws(() => parseConsent({ ...consent, granted_at: "2026-11-01T10:00:00.000Z" }), /whole seconds/);
  assert.throws(() => parseConsent({ ...consent, consent_grant_id: "Ramesh Kumar 9876543210" }), /pseudonymous/);
  assert.throws(() => parseConsent({ ...consent, expires_at: consent.granted_at }), /after/);
  assert.throws(() => parseConsent({ ...consent, granted_at: "2026-02-30T10:00:00Z" }), ValidationError);
  assert.throws(() => parseDocument({ document_id: "d1", file_base64: "not base64!!" }), /base64/);
  assert.throws(() => parseDocument({ document_id: "d1", file_base64: "" }), ValidationError);
});

test("access log accepts the backend's document_id values (timeline / none / entry id)", () => {
  for (const document_id of ["timeline", "none", "6724f1c2a9e3b1d4c5e6f7a8"])
    parseAccessLog({ log_id: "c0d1e2f3-0000-4000-8000-000000000001", doctor_id: consent.accessor_id,
      patient_id_token: consent.patient_id_token, document_id, accessed_at: "2026-11-01T10:15:00Z", action: "view_timeline" });
});

test("memo v2 carries only type + hash; v1 still parses", () => {
  const h = hash_document(Buffer.from("x"));
  assert.equal(buildMemo("DOC", h), `medchain:v2|DOC|${h}`);
  assert.deepEqual(parseMemo(buildMemo("DOC", h)), { type: "DOC", hash: h, version: 2 });
  assert.deepEqual(parseMemo(`medchain:v1|DOC|doc_1|${h}|1700000000`), { type: "DOC", id: "doc_1", hash: h, ts: 1700000000, version: 1 });
  assert.equal(parseMemo(`medchain:v2|DOC|nothex`), null);
  assert.throws(() => buildMemo("DOC", "A".repeat(64)));
  assert.deepEqual(parseSignatureMemo(`[79] medchain:v2|DOC|${h}; [3] abc`).map(r => r.hash), [h]);
});

test("compare: verified / mismatch / not-found / wrong record type", () => {
  const rec = parseMemo(buildMemo("DOC", hash_document(Buffer.from("original"))));
  const v = compareRecord(hash_document(Buffer.from("original")), rec, "DOC", 1762000003);
  assert.equal(v.status, "verified");
  assert.equal(v.timestamp, "2025-11-01T12:26:43Z"); // whole seconds, no milliseconds
  assert.equal(compareRecord(hash_document(Buffer.from("original!")), rec, "DOC").status, "mismatch");
  assert.equal(compareRecord("0".repeat(64), null, "DOC").status, "not-found");
  assert.equal(compareRecord(rec!.hash, rec, "CONSENT").status, "not-found");
});
