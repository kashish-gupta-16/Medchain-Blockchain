import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { connection, loadKeypair } from "../client/config.js";

const kp = loadKeypair();
for (let i = 1; i <= 4; i++) {
  try {
    const sig = await connection.requestAirdrop(kp.publicKey, 1 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    console.log(`Airdrop OK. Balance: ${(await connection.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL} SOL`);
    process.exit(0);
  } catch (e) {
    console.log(`Attempt ${i} failed: ${(e as Error).message}`);
    if (i < 4) await new Promise(r => setTimeout(r, 10_000 * i));
  }
}
console.log("Airdrop failed (devnet faucet is often rate-limited). Get free devnet SOL at https://faucet.solana.com for:", kp.publicKey.toBase58());
