// End-to-end demo for judges: write -> verify -> tamper -> verify again (real devnet).
import { defaultService } from "../client/service.js";
import { hash_document } from "../client/hash_document.js";

const svc = defaultService();
const original = Buffer.from(`PRESCRIPTION-DEMO ${new Date().toISOString()}: dummy report bytes (not real medical data)`);
let w = await svc.anchor("DOC", "doc_demo_001", hash_document(original));
console.log("1) Recorded:", w);
let tx = w.solana_tx;
if (!tx && w.queue_id) {
  console.log("   Waiting for devnet confirmation...");
  tx = (await svc.anchorer.waitFor(w.queue_id, 90_000))?.solana_tx ?? undefined;
}
if (!tx) { console.log("Still pending; devnet may be down. Run again later."); process.exit(0); }
console.log("   Explorer: https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
console.log("2) Original file ->", await svc.verifier.verifyDocument(original, tx));
console.log("3) Tampered file ->", await svc.verifier.verifyDocument(Buffer.concat([original, Buffer.from(" EDITED")]), tx));
w = await svc.anchor("DOC", "doc_demo_001", hash_document(original));
console.log("4) Same file sent again (retry) -> same tx, no new memo:", w.solana_tx === tx);
process.exit(0);
