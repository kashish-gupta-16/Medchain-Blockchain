import { Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { connection, loadKeypair, MEMO_PROGRAM_ID } from "./config.js";
import { buildMemo, RecordType } from "./memo.js";
import { enqueue, processQueue } from "./queue.js";
import { hash_document } from "./hash_document.js";

/** Low-level: send one memo, with retries + backoff. Throws if all attempts fail. */
export async function sendMemo(memo: string, retries = 3): Promise<string> {
  const payer = loadKeypair();
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      const ix = new TransactionInstruction({ keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: false }], programId: MEMO_PROGRAM_ID, data: Buffer.from(memo, "utf8") });
      return await sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer], { commitment: "confirmed" });
    } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 1000 * 2 ** i)); }
  }
  throw lastErr;
}

export interface WriteResult { status: "confirmed" | "chain_pending"; solana_tx?: string; queue_id?: string; hash: string }

/** Never throws for chain failures: returns chain_pending + queue_id instead. */
export async function writeRecord(type: RecordType, id: string, hash: string): Promise<WriteResult> {
  const memo = buildMemo(type, id, hash); // throws only on invalid input (our bug / bad id)
  try { return { status: "confirmed", solana_tx: await sendMemo(memo), hash }; }
  catch { return { status: "chain_pending", queue_id: enqueue(memo), hash }; }
}

export const retryPending = () => processQueue(sendMemo);

/** Hash a document and write its proof. Returns solana_tx for the API to store. */
export const write_hash = (document_id: string, file: string | Buffer) =>
  writeRecord("DOC", document_id, hash_document(file));
