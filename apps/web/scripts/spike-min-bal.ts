import { JsonRpcProvider, Contract, formatEther } from "ethers";
async function main() {
  const rpc = "https://evmrpc-testnet.0g.ai";
  const provider = new JsonRpcProvider(rpc);
  const ledgerCA = "0xE70830508dAc0A97e6c087c75f402f9Be669E406";
  const c = new Contract(ledgerCA, [
    "function MIN_ACCOUNT_BALANCE() view returns (uint256)",
    "function MIN_TRANSFER_AMOUNT() view returns (uint256)",
  ], provider);
  const minBal = await c.MIN_ACCOUNT_BALANCE();
  const minT = await c.MIN_TRANSFER_AMOUNT();
  console.log("MIN_ACCOUNT_BALANCE:", minBal.toString(), "wei =", formatEther(minBal), "OG");
  console.log("MIN_TRANSFER_AMOUNT:", minT.toString(), "wei =", formatEther(minT), "OG");
}
main().catch(e => { console.error(e); process.exit(1); });
