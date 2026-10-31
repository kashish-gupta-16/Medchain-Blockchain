import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { connection, loadKeypair } from "../client/config.js";

const kp = loadKeypair();

const balance = await connection.getBalance(kp.publicKey);

console.log("Wallet:", kp.publicKey.toBase58());
console.log("Network: Devnet");
console.log("Balance:", balance / LAMPORTS_PER_SOL, "SOL");