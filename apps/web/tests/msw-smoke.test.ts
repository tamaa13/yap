import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { createPublicClient, http as viemHttp } from "viem";
import { server } from "./mocks/server";
import { zg0GTestnet } from "@/lib/chains";

describe("msw smoke", () => {
  it("intercepts fetch to the 0G testnet RPC URL", async () => {
    server.use(
      http.post(zg0GTestnet.rpcUrls.default.http[0], () =>
        HttpResponse.json({ jsonrpc: "2.0", id: 1, result: "0x40da" }),
      ),
    );
    const res = await fetch(zg0GTestnet.rpcUrls.default.http[0], {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId" }),
    });
    const body = await res.json();
    expect(body.result).toBe("0x40da");
  });

  it("intercepts viem's HTTP transport", async () => {
    server.use(
      http.post(zg0GTestnet.rpcUrls.default.http[0], async ({ request }) => {
        const body = (await request.json()) as { id: number; method: string };
        // eslint-disable-next-line no-console
        console.log("[viem-smoke]", body.method);
        if (body.method === "eth_chainId")
          return HttpResponse.json({ jsonrpc: "2.0", id: body.id, result: "0x40da" });
        return HttpResponse.json({
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32601, message: "no" },
        });
      }),
    );
    const client = createPublicClient({
      chain: zg0GTestnet,
      transport: viemHttp(zg0GTestnet.rpcUrls.default.http[0]),
    });
    const id = await client.getChainId();
    expect(id).toBe(16602);
  });
});
