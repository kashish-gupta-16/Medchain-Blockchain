import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { connection, loadKeypair } from "../client/config.js";
const kp = loadKeypair();
let airdropSucceeded = false;
for (let i = 1; i <= 4; i++) {
  try {
    const sig = await connection.requestAirdrop(kp.publicKey, 1 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    const bal = await connection.getBalance(kp.publicKey);
    console.log(`Airdrop OK. Balance: ${bal / LAMPORTS_PER_SOL} SOL`);
    airdropSucceeded = true;
    break;
  } catch (error: any) {
  console.log(`Attempt ${i} failed`);

  console.log("Error message:", error.message);
  console.log("Error details:", error);

  if (i < 4) {
    console.log("Waiting before retry...");
    await new Promise(r => setTimeout(r, 10000 * i));
  }
}
}
if (!airdropSucceeded) {
  console.log("Airdrop failed. Get free devnet SOL at https://faucet.solana.com using this address:", kp.publicKey.toBase58());
}
