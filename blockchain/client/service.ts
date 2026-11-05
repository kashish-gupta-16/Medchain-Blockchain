// Wires the real Solana connection, the store, the anchorer and the verifier together.
import { connection, loadKeypair, STORE_PATH, trustedPubkey } from "./config.js";
import { Chain, solanaChain } from "./chain.js";
import { Store } from "./store.js";
import { Anchorer, AnchorOptions } from "./anchor.js";
import { Verifier } from "./verify.js";
import { RecordType } from "./memo.js";
import { hash_access_log, hash_consent, hash_document, hash_revoke, ConsentFields, RevokeFields, AccessLogFields } from "./hash_document.js";

export interface Service {
  anchorer: Anchorer; verifier: Verifier; store: Store;
  anchor(type: RecordType, record_id: string, hash: string): ReturnType<Anchorer["anchor"]>;
}

export function createService(opts: { chain?: Chain; store?: Store; trustedSigner?: string; anchor?: Partial<AnchorOptions> } = {}): Service {
  const trustedSigner = opts.trustedSigner ?? trustedPubkey();
  const chain = opts.chain ?? solanaChain(connection, loadKeypair());
  const store = opts.store ?? new Store(STORE_PATH);
  const anchorer = new Anchorer(chain, store, { trustedSigner, ...opts.anchor });
  const verifier = new Verifier(chain, trustedSigner);
  return { anchorer, verifier, store, anchor: (t, id, h) => anchorer.anchor(t, id, h) };
}

// Convenience functions for scripts (use one shared service).
let shared: Service | undefined;
export const defaultService = () => (shared ??= createService());

export const write_hash = (document_id: string, file: string | Buffer) => defaultService().anchor("DOC", document_id, hash_document(file));
export const write_consent = (c: ConsentFields) => defaultService().anchor("CONSENT", c.consent_grant_id, hash_consent(c));
export const write_revoke = (r: RevokeFields) => defaultService().anchor("REVOKE", r.consent_grant_id, hash_revoke(r));
export const write_access_log = (e: AccessLogFields) => defaultService().anchor("ACCESS", e.log_id, hash_access_log(e));
export const verify = (file: string | Buffer, solana_tx: string) => defaultService().verifier.verifyDocument(file, solana_tx);
export const verify_consent = (c: ConsentFields, solana_tx: string) => defaultService().verifier.verifyConsent(c, solana_tx);
