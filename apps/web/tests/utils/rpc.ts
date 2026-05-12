import { http, HttpResponse } from "msw";
import {
  decodeFunctionData,
  encodeFunctionResult,
  type Abi,
} from "viem";
import { zg0GTestnet } from "@/lib/chains";

type Resolver = (args: readonly unknown[]) => unknown;
type FunctionMap = Record<string, unknown | Resolver>;

export interface AddressMock {
  /** Contract address. Matched case-insensitively. */
  to: `0x${string}`;
  /** ABI for decoding the incoming call + encoding the result. */
  abi: Abi;
  /** Per-function-name resolver. Either a static value (used as result) or
   *  a function `(decodedArgs) => result`. Result must match the ABI's
   *  output shape (tuple for multi-output, single value otherwise). */
  functions: FunctionMap;
  /** Optional: list of (topic0, logsForRange) for eth_getLogs handling.
   *  Logs are returned for any fromBlock/toBlock since the test harness
   *  doesn't simulate chain reorgs. */
  logs?: Array<{
    topics?: `0x${string}`[];
    data?: `0x${string}`;
    blockNumber?: `0x${string}`;
    transactionHash?: `0x${string}`;
    logIndex?: `0x${string}`;
    transactionIndex?: `0x${string}`;
  }>;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown[];
}

function ok(id: number | string, result: unknown) {
  if (process.env.YAP_TEST_RPC_LOG === "1") {
    // eslint-disable-next-line no-console
    console.log("[rpc:ok]", id, String(result).slice(0, 200));
  }
  return HttpResponse.json({ jsonrpc: "2.0", id, result });
}
function err(id: number | string, message: string, code = -32000) {
  if (process.env.YAP_TEST_RPC_LOG === "1") {
    // eslint-disable-next-line no-console
    console.log("[rpc:err]", id, code, message);
  }
  return HttpResponse.json({
    jsonrpc: "2.0",
    id,
    error: { code, message: `test: ${message}` },
  });
}

/**
 * Build a single msw handler dispatching JSON-RPC requests at the 0G testnet
 * RPC URL through the provided per-address mocks. The dispatcher:
 *
 * - Answers boilerplate (`eth_chainId`, `eth_blockNumber`, `net_version`,
 *   `eth_getBlockByNumber`) so wagmi connect flows don't pollute test setup.
 * - For `eth_call`, looks up the mock by `to` and decodes via that mock's
 *   ABI. Missing addresses or function names error loudly.
 * - For `eth_getLogs`, returns the union of `logs` arrays across mocks
 *   whose address matches the filter. (Test scenarios that need
 *   block-range filtering should override per-test.)
 * - Unknown methods return a -32601 error.
 *
 * Pass the result into `server.use(...)` from a per-test or per-suite
 * `beforeEach` to override the default handler.
 */
export function rpcServer(addressMocks: AddressMock[]) {
  const byAddr = new Map<string, AddressMock>();
  for (const m of addressMocks) byAddr.set(m.to.toLowerCase(), m);

  return http.post(zg0GTestnet.rpcUrls.default.http[0], async ({ request }) => {
    const body = (await request.json()) as JsonRpcRequest;
    if (process.env.YAP_TEST_RPC_LOG === "1") {
      console.log("[rpc]", body.method, JSON.stringify(body.params)?.slice(0, 120));
    }
    switch (body.method) {
      case "eth_chainId":
        return ok(body.id, "0x40da");
      case "eth_blockNumber":
        return ok(body.id, "0x1");
      case "net_version":
        return ok(body.id, "16602");
      case "eth_getBlockByNumber":
        return ok(body.id, {
          number: "0x1",
          timestamp: "0x0",
          hash: `0x${"00".repeat(32)}`,
          parentHash: `0x${"00".repeat(32)}`,
          transactions: [],
        });
      case "eth_call": {
        const params = body.params as
          | [{ to?: `0x${string}`; data?: `0x${string}` }, unknown]
          | undefined;
        const callTo = params?.[0]?.to?.toLowerCase();
        const data = params?.[0]?.data;
        if (!callTo || !data) return err(body.id, "eth_call missing to/data");
        const mock = byAddr.get(callTo);
        if (!mock) return err(body.id, `no mock for address ${callTo}`);
        let decoded: { functionName: string; args: readonly unknown[] | undefined };
        try {
          decoded = decodeFunctionData({ abi: mock.abi, data }) as typeof decoded;
        } catch (e) {
          return err(body.id, `decode failed at ${callTo}: ${(e as Error).message}`);
        }
        const resolver = mock.functions[decoded.functionName];
        if (resolver === undefined) {
          return err(
            body.id,
            `no mock for ${decoded.functionName} at ${callTo}`,
          );
        }
        let value: unknown;
        try {
          value =
            typeof resolver === "function"
              ? (resolver as Resolver)(decoded.args ?? [])
              : resolver;
        } catch (e) {
          return err(body.id, `resolver threw: ${(e as Error).message}`);
        }
        let encoded: `0x${string}`;
        try {
          encoded = encodeFunctionResult({
            abi: mock.abi,
            functionName: decoded.functionName,
            result: value as never,
          });
        } catch (e) {
          return err(
            body.id,
            `encode failed for ${decoded.functionName}: ${(e as Error).message}`,
          );
        }
        return ok(body.id, encoded);
      }
      case "eth_getLogs": {
        const filter = (body.params as [{ address?: `0x${string}` }])?.[0];
        const filterAddr = filter?.address?.toLowerCase();
        const merged: unknown[] = [];
        for (const m of byAddr.values()) {
          if (filterAddr && m.to.toLowerCase() !== filterAddr) continue;
          if (!m.logs) continue;
          for (const log of m.logs) {
            merged.push({
              address: m.to,
              blockHash: `0x${"00".repeat(32)}`,
              blockNumber: log.blockNumber ?? "0x1",
              data: log.data ?? "0x",
              logIndex: log.logIndex ?? "0x0",
              removed: false,
              topics: log.topics ?? [],
              transactionHash:
                log.transactionHash ?? `0x${"00".repeat(32)}`,
              transactionIndex: log.transactionIndex ?? "0x0",
            });
          }
        }
        return ok(body.id, merged);
      }
      default:
        return err(body.id, `no handler for ${body.method}`, -32601);
    }
  });
}

