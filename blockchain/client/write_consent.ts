import { writeRecord } from "./write_hash.js";
import { ConsentFields, RevokeFields, hash_consent, hash_revoke, hash_access_log } from "./hash_document.js";

export const write_consent = (c: ConsentFields) => writeRecord("CONSENT", c.consent_grant_id, hash_consent(c));
export const write_revoke = (r: RevokeFields) => writeRecord("REVOKE", r.consent_grant_id, hash_revoke(r));
export const write_access_log = (e: Parameters<typeof hash_access_log>[0]) => writeRecord("ACCESS", e.log_id, hash_access_log(e));
