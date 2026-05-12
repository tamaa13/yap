import { http, HttpResponse } from "msw";
import { zg0GTestnet } from "@/lib/chains";

interface JsonRpcRequest {
  id: number | string;
  method: string;
  params?: unknown[];
}

/**
 * Base JSON-RPC handler for the 0G testnet RPC. Defaults answer the
 * boilerplate calls wagmi fires at connect time (chain id, block number).
 * Per-test handlers added via `server.use(...)` override these — for
 * eth_call routing keyed on `to` + 4-byte selector, see
 * `tests/utils/rpc.ts` (introduced in Phase B).
 *
 * Unhandled methods deliberately error so missing fixtures fail loud
 * rather than masquerading as silent reverts.
 */
export const handlers = [
  http.post(zg0GTestnet.rpcUrls.default.http[0], async ({ request }) => {
    const body = (await request.json()) as JsonRpcRequest;
    switch (body.method) {
      case "eth_chainId":
        // 0x40da = 16602 = zg0GTestnet.id
        return HttpResponse.json({ jsonrpc: "2.0", id: body.id, result: "0x40da" });
      case "eth_blockNumber":
        return HttpResponse.json({ jsonrpc: "2.0", id: body.id, result: "0x1" });
      case "eth_getBlockByNumber":
        return HttpResponse.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            number: "0x1",
            timestamp: "0x0",
            hash: `0x${"00".repeat(32)}`,
            parentHash: `0x${"00".repeat(32)}`,
            transactions: [],
          },
        });
      case "net_version":
        return HttpResponse.json({ jsonrpc: "2.0", id: body.id, result: "16602" });
      default:
        return HttpResponse.json({
          jsonrpc: "2.0",
          id: body.id,
          error: {
            code: -32601,
            message: `test: no handler for ${body.method}`,
          },
        });
    }
  }),
];
