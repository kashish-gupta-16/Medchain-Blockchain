// Thin wrapper over Solana. Everything else talks to this interface, so tests can swap in a fake chain.
import { Connection, Keypair, Transaction, TransactionInstruction } from "@solana/web3.js";
import { MEMO_PROGRAM_ID } from "./config.js";

export type TxState = "confirmed" | "failed" | "unknown";
export interface Submitted { signature: string; lastValidBlockHeight: number }
export interface SignatureMemo { signature: string; memo: string | null; failed: boolean }
export interface FetchedTx { signer?: string; memos: string[]; blockTime?: number | null }

export interface Chain {
  /** Sign and send one memo transaction. Returns as soon as the RPC accepts it (does not wait for confirmation). */
  submit(memo: string): Promise<Submitted>;
  statuses(signatures: string[]): Promise<TxState[]>;
  blockHeight(): Promise<number>;
  /** Our wallet's recent transactions with their memo text, newest first. */
  listMemos(opts: { limit: number; before?: string; until?: string }): Promise<SignatureMemo[]>;
  fetchTx(signature: string): Promise<FetchedTx | null>;
}

export function solanaChain(connection: Connection, payer: Keypair): Chain {
  return {
    async submit(memo) {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight }).add(
        new TransactionInstruction({
          keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: false }],
          programId: MEMO_PROGRAM_ID, data: Buffer.from(memo, "utf8"),
        }));
      tx.sign(payer);
      const signature = await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "confirmed", maxRetries: 5 });
      return { signature, lastValidBlockHeight };
    },
    async statuses(signatures) {
      const out: TxState[] = [];
      for (let i = 0; i < signatures.length; i += 200) {
        const { value } = await connection.getSignatureStatuses(signatures.slice(i, i + 200), { searchTransactionHistory: true });
        for (const s of value) {
          if (!s) out.push("unknown");
          else if (s.err) out.push("failed");
          else if (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized") out.push("confirmed");
          else out.push("unknown");
        }
      }
      return out;
    },
    blockHeight: () => connection.getBlockHeight("confirmed"),
    async listMemos({ limit, before, until }) {
      const sigs = await connection.getSignaturesForAddress(payer.publicKey, { limit, before, until }, "confirmed");
      return sigs.map(s => ({ signature: s.signature, memo: s.memo, failed: !!s.err }));
    },
    async fetchTx(signature) {
      const tx = await connection.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      if (!tx) return null;
      const memos: string[] = [];
      for (const ix of tx.transaction.message.instructions)
        if ("parsed" in ix && ix.program === "spl-memo" && typeof ix.parsed === "string") memos.push(ix.parsed);
      return { signer: tx.transaction.message.accountKeys[0]?.pubkey.toBase58(), memos, blockTime: tx.blockTime };
    },
  };
}

export class TimeoutError extends Error {}
export function withTimeout<T>(p: Promise<T>, ms: number, what = "chain call"): Promise<T> {
  if (ms <= 0) return Promise.reject(new TimeoutError(`${what} timed out`));
  let t: NodeJS.Timeout;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<T>((_, rej) => { t = setTimeout(() => rej(new TimeoutError(`${what} timed out`)), ms); }),
  ]);
}
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
