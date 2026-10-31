// End-to-end demo for judges: write -> verify -> tamper -> verify again.
import { write_hash } from "../client/write_hash.js";
import { verify } from "../client/verify.js";
const original = Buffer.from("PRESCRIPTION-DEMO: dummy report bytes (not real medical data)");
const w = await write_hash("doc_demo_001", original);
console.log("1) Recorded:", w);
if (!w.solana_tx) { console.log("Chain pending; run again when devnet is reachable."); process.exit(0); }
console.log("   Explorer: https://explorer.solana.com/tx/" + w.solana_tx + "?cluster=devnet");
console.log("2) Original file ->", await verify(original, w.solana_tx));
const tampered = Buffer.from("PRESCRIPTION-DEMO: dummy report bytes (not real medical data) EDITED");
console.log("3) Tampered file ->", await verify(tampered, w.solana_tx));
