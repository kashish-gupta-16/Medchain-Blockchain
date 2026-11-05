import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { connection, loadKeypair, RPC_URL } from "../client/config.js";

const kp = loadKeypair();
const balance = await connection.getBalance(kp.publicKey);
console.log("Wallet:", kp.publicKey.toBase58());
console.log("RPC:", RPC_URL);
console.log("Balance:", balance / LAMPORTS_PER_SOL, "SOL", balance < 0.05 * LAMPORTS_PER_SOL ? "(low: run npm run airdrop)" : "");
