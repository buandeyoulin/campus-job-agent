// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("Phase 0 web shell", () => {
  it("identifies the local technical-validation build", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "校园求职 Agent" })).toBeInTheDocument();
    expect(screen.getByText("Phase 0 技术验证")).toBeInTheDocument();
  });
});
