import { describe, expect, it, vi } from "vitest";
import { BraveCompanyDiscovery, CompanyDiscoveryError } from "../src/index.js";

describe("Brave company discovery", () => {
  it("sends the secret only in X-Subscription-Token and parses bounded results", async () => {
    const secret = "test-secret-never-leak";
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).not.toContain(secret);
      expect(init?.body).toBeUndefined();
      const headers = new Headers(init?.headers);
      expect(headers.get("X-Subscription-Token")).toBe(secret);
      expect([...headers.entries()].filter(([, value]) => value.includes(secret))).toHaveLength(1);
      return new Response(JSON.stringify({ web: { results: [{ title: "Example Semiconductor Careers", url: "https://example.com/careers", description: "Official campus jobs" }] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const provider = new BraveCompanyDiscovery({ apiKey: secret, fetcher, wait: async () => undefined });

    await expect(provider.discover(["IC 验证 公司 校园招聘 官网"])).resolves.toEqual([{
      query: "IC 验证 公司 校园招聘 官网",
      title: "Example Semiconductor Careers",
      url: "https://example.com/careers",
      snippet: "Official campus jobs",
    }]);
  });

  it("returns a typed retry time for rate limiting without leaking the key", async () => {
    const secret = "rate-limit-secret";
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ message: secret }), {
      status: 429,
      headers: { "X-RateLimit-Reset": "1784332800", "content-type": "application/json" },
    }));
    const provider = new BraveCompanyDiscovery({ apiKey: secret, fetcher, wait: async () => undefined });

    try {
      await provider.discover(["query"]);
      throw new Error("Expected discovery to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(CompanyDiscoveryError);
      expect(error).toMatchObject({ code: "rate_limited", retryAt: "2026-07-18T00:00:00.000Z" });
      expect(String(error)).not.toContain(secret);
    }
  });

  it("sanitizes provider failures", async () => {
    const secret = "upstream-secret";
    const provider = new BraveCompanyDiscovery({
      apiKey: secret,
      fetcher: vi.fn(async () => new Response(secret, { status: 500 })),
      wait: async () => undefined,
    });
    await expect(provider.discover(["query"])).rejects.toThrow("Company discovery is unavailable");
    await expect(provider.discover(["query"])).rejects.not.toThrow(secret);
  });
});
