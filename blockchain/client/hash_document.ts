import { createHash } from "crypto";
import { readFileSync } from "fs";

export const sha256Hex = (b: Buffer | Uint8Array | string): string =>
  createHash("sha256").update(b).digest("hex");

/** SHA-256 of the exact file bytes (lowercase hex). Accepts a file path or a Buffer. Same as the backend's doc_hash. */
export function hash_document(file: string | Buffer | Uint8Array): string {
  return sha256Hex(typeof file === "string" ? readFileSync(file) : file);
}

export interface ConsentFields {
  consent_grant_id: string; patient_id_token: string; accessor_id: string;
  granted_at: string; expires_at: string; // ISO-8601 UTC, whole seconds, e.g. 2026-11-01T10:00:00Z
}
export interface RevokeFields {
  consent_grant_id: string; patient_id_token: string; accessor_id: string; revoked_at: string;
}
export interface AccessLogFields {
  log_id: string; doctor_id: string; patient_id_token: string; document_id: string; accessed_at: string; action: string;
}

// Canonical form = JSON.stringify with keys in the contract order and no whitespace.
// Objects are rebuilt field by field, so extra fields, key order or spacing in the HTTP body never change the hash.
export const canonical_consent = (c: ConsentFields) => JSON.stringify({
  consent_grant_id: c.consent_grant_id, patient_id_token: c.patient_id_token, accessor_id: c.accessor_id,
  granted_at: c.granted_at, expires_at: c.expires_at,
});
export const canonical_revoke = (r: RevokeFields) => JSON.stringify({
  consent_grant_id: r.consent_grant_id, patient_id_token: r.patient_id_token, accessor_id: r.accessor_id,
  revoked_at: r.revoked_at,
});
export const canonical_access_log = (e: AccessLogFields) => JSON.stringify({
  log_id: e.log_id, doctor_id: e.doctor_id, patient_id_token: e.patient_id_token,
  document_id: e.document_id, accessed_at: e.accessed_at, action: e.action,
});

export const hash_consent = (c: ConsentFields) => sha256Hex(canonical_consent(c));
export const hash_revoke = (r: RevokeFields) => sha256Hex(canonical_revoke(r));
export const hash_access_log = (e: AccessLogFields) => sha256Hex(canonical_access_log(e));
