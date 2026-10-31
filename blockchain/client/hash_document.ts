import { createHash } from "crypto";
import { readFileSync } from "fs";

export const sha256Hex = (b: Buffer | Uint8Array | string): string =>
  createHash("sha256").update(b).digest("hex");

/** SHA-256 of the exact file bytes. Accepts a file path or a Buffer. */
export function hash_document(file: string | Buffer): string {
  return sha256Hex(typeof file === "string" ? readFileSync(file) : file);
}

export interface ConsentFields {
  consent_grant_id: string; patient_id_token: string; accessor_id: string;
  granted_at: string; expires_at: string; // ISO-8601 UTC, e.g. 2026-10-31T10:00:00Z
}
export const hash_consent = (c: ConsentFields) =>
  sha256Hex([c.consent_grant_id, c.patient_id_token, c.accessor_id, c.granted_at, c.expires_at].join("|"));

export interface RevokeFields {
  consent_grant_id: string; patient_id_token: string; accessor_id: string; revoked_at: string;
}
export const hash_revoke = (r: RevokeFields) =>
  sha256Hex(["REVOKE", r.consent_grant_id, r.patient_id_token, r.accessor_id, r.revoked_at].join("|"));

export const hash_access_log = (entry: { log_id: string; doctor_id: string; patient_id_token: string; document_id: string; accessed_at: string; action: string }) =>
  sha256Hex([entry.log_id, entry.doctor_id, entry.patient_id_token, entry.document_id, entry.accessed_at, entry.action].join("|"));
