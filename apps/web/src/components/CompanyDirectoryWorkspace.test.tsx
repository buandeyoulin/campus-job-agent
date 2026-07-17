// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompanyDirectoryApi } from "../company-directory-api";
import { CompanyDirectoryWorkspace } from "./CompanyDirectoryWorkspace";

const capturedAt = "2026-07-18T08:00:00.000Z";

function createApi(): CompanyDirectoryApi {
  return {
    list: vi.fn().mockResolvedValue({
      entries: [{
        id: "018a2c8a-51dc-7a81-a240-000000000001",
        companyName: "Example Semiconductor",
        careerUrl: "https://careers.example.com/campus",
        directorySource: "offerbiu",
        directoryUrl: "https://offerbiu.com/company/example",
        status: "pending",
        firstDiscoveredAt: capturedAt,
        lastDiscoveredAt: capturedAt,
      }], total: 1, page: 1, pageSize: 20,
    }),
    scanOfferBiu: vi.fn().mockResolvedValue({ source: "offerbiu", fetched: 1, created: 1, updated: 0, completedAt: capturedAt }),
  };
}

describe("CompanyDirectoryWorkspace", () => {
  afterEach(() => cleanup());

  it("scans the directory and exposes an ordinary external career link", async () => {
    const api = createApi();
    render(<CompanyDirectoryWorkspace api={api} />);

    expect(await screen.findByText("Example Semiconductor")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open career site" })).toHaveAttribute("href", "https://careers.example.com/campus");
    fireEvent.click(screen.getByRole("button", { name: "Scan OfferBiu directory" }));
    await waitFor(() => expect(api.scanOfferBiu).toHaveBeenCalledOnce());
  });
});
