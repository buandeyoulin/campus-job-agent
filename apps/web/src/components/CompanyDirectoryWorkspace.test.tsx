// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompanyDirectoryApi } from "../company-directory-api";
import { CompanyDirectoryWorkspace } from "./CompanyDirectoryWorkspace";

const capturedAt = "2026-07-18T08:00:00.000Z";

function createApi(): CompanyDirectoryApi {
  return {
    list: vi.fn().mockResolvedValue({
      companies: [{
        id: "018a2c8a-51dc-7a81-a240-000000000001",
        canonicalName: "Example Semiconductor",
        aliases: ["Example Semi"],
        officialDomain: "example.com",
        industries: ["chip_design"],
        regions: ["中国"],
        origin: "manual",
        status: "active",
        verificationScore: 100,
        verificationEvidence: [{ kind: "official_domain", url: "https://example.com/", detail: "Reviewed" }],
        verifiedAt: capturedAt,
        createdAt: capturedAt,
        updatedAt: capturedAt,
      }], total: 1, page: 1, pageSize: 20,
    }),
  };
}

describe("CompanyDirectoryWorkspace", () => {
  afterEach(() => cleanup());

  it("lists career links without exposing an aggregate-directory scan action", async () => {
    const api = createApi();
    render(<CompanyDirectoryWorkspace api={api} />);

    expect(await screen.findByText("Example Semiconductor")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open official site" })).toHaveAttribute("href", "https://example.com/");
    expect(screen.queryByRole("button", { name: /scan/i })).not.toBeInTheDocument();
  });
});
