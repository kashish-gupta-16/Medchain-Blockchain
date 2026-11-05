// Input checks for everything the backend sends. Throws ValidationError (-> HTTP 400).
import type { ConsentFields, RevokeFields, AccessLogFields } from "./hash_document.js";

export class ValidationError extends Error { readonly status = 400; }

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;           // whole seconds + Z, e.g. 2026-11-01T10:00:00Z
const ACTION = /^[a-z][a-z0-9_]{0,31}$/;                         // view_timeline, view_record, upload, ...
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;              // base58 tx signature
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

function asObject(b: unknown, what = "body"): Record<string, unknown> {
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new ValidationError(`${what} must be a JSON object`);
  return b as Record<string, unknown>;
}
function str(b: Record<string, unknown>, k: string): string {
  const v = b[k];
  if (typeof v !== "string" || v === "") throw new ValidationError(`${k} is required (string)`);
  return v;
}
export function id(b: Record<string, unknown>, k: string): string {
  const v = str(b, k);
  if (!ID.test(v)) throw new ValidationError(`${k} must match [A-Za-z0-9_-]{1,64} (pseudonymous id only)`);
  return v;
}
export function timestamp(b: Record<string, unknown>, k: string): string {
  const v = str(b, k);
  const d = new Date(v);
  if (!TS.test(v) || isNaN(d.getTime()) || d.toISOString() !== v.replace("Z", ".000Z"))
    throw new ValidationError(`${k} must be ISO-8601 UTC with whole seconds, e.g. 2026-11-01T10:00:00Z`);
  return v;
}

export function parseConsent(body: unknown, what?: string): ConsentFields {
  const b = asObject(body, what);
  const c = {
    consent_grant_id: id(b, "consent_grant_id"), patient_id_token: id(b, "patient_id_token"),
    accessor_id: id(b, "accessor_id"), granted_at: timestamp(b, "granted_at"), expires_at: timestamp(b, "expires_at"),
  };
  if (Date.parse(c.expires_at) <= Date.parse(c.granted_at)) throw new ValidationError("expires_at must be after granted_at");
  return c;
}

export function parseRevoke(body: unknown): RevokeFields {
  const b = asObject(body);
  return {
    consent_grant_id: id(b, "consent_grant_id"), patient_id_token: id(b, "patient_id_token"),
    accessor_id: id(b, "accessor_id"), revoked_at: timestamp(b, "revoked_at"),
  };
}

export function parseAccessLog(body: unknown): AccessLogFields {
  const b = asObject(body);
  const action = str(b, "action");
  if (!ACTION.test(action)) throw new ValidationError("action must be lowercase letters/digits/_ (e.g. view_timeline)");
  return {
    log_id: id(b, "log_id"), doctor_id: id(b, "doctor_id"), patient_id_token: id(b, "patient_id_token"),
    document_id: id(b, "document_id"), accessed_at: timestamp(b, "accessed_at"), action,
  };
}

/** Decodes file_base64 into the exact file bytes. Rejects text that is not base64 (Buffer.from would silently skip it). */
export function fileBytes(body: unknown): Buffer {
  const b = asObject(body);
  const s = str(b, "file_base64").replace(/\s+/g, "");
  if (!BASE64.test(s) || s.length % 4 === 1) throw new ValidationError("file_base64 is not valid base64");
  const bytes = Buffer.from(s, "base64");
  if (bytes.length === 0) throw new ValidationError("file_base64 decodes to an empty file");
  return bytes;
}

export function signature(body: unknown): string {
  const v = str(asObject(body), "solana_tx");
  if (!SIGNATURE.test(v)) throw new ValidationError("solana_tx must be a base58 transaction signature");
  return v;
}

export function parseDocument(body: unknown): { document_id: string; bytes: Buffer } {
  return { document_id: id(asObject(body), "document_id"), bytes: fileBytes(body) };
}
export function parseVerify(body: unknown) { return { bytes: fileBytes(body), solana_tx: signature(body) }; }
export function parseVerifyConsent(body: unknown) {
  const b = asObject(body);
  return { consent: parseConsent(b.consent, "consent"), solana_tx: signature(b) };
}
