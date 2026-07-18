import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const extensionRoot = path.resolve(import.meta.dirname, "../extension");

async function manifest() {
  return JSON.parse(await readFile(path.join(extensionRoot, "manifest.json"), "utf8")) as {
    manifest_version: number;
    permissions?: string[];
    host_permissions: string[];
    background: { service_worker: string };
    content_scripts: Array<{ js: string[]; css?: string[]; world?: string }>;
  };
}

async function extensionJavaScript() {
  const files = (await readdir(extensionRoot)).filter((file) => file.endsWith(".js"));
  return Promise.all(files.map((file) => readFile(path.join(extensionRoot, file), "utf8"))).then((parts) => parts.join("\n"));
}

describe("OfferBiu bridge extension security", () => {
  it("uses Manifest V3 with only the two approved hosts and no privileged permissions", async () => {
    const value = await manifest();
    expect(value.manifest_version).toBe(3);
    expect(value.host_permissions).toEqual([
      "https://offerbiu.com/*",
      "http://127.0.0.1:4317/*",
    ]);
    expect(value.permissions ?? []).toEqual([]);
  });

  it.each(["chrome.cookies", "document.cookie", "localStorage", "sessionStorage"])(
    "never references %s",
    async (forbidden) => expect(await extensionJavaScript()).not.toContain(forbidden),
  );

  it("separates page-world observation from extension transport", async () => {
    const value = await manifest();
    const main = value.content_scripts.find((script) => script.world === "MAIN");
    const isolated = value.content_scripts.find((script) => script.world !== "MAIN");

    expect(main?.js).toEqual(["core.js", "page-bridge.js"]);
    expect(isolated?.js).toEqual(["core.js", "content.js"]);
    expect(value.background.service_worker).toBe("background.js");
  });

  it("does not forward request headers through either bridge channel", async () => {
    const source = await extensionJavaScript();
    expect(source).not.toMatch(/postMessage\([^)]*headers/is);
    expect(source).not.toMatch(/sendMessage\([^)]*headers/is);
  });

  it("lets the later isolated script recover an early page-ready signal", async () => {
    const page = await readFile(path.join(extensionRoot, "page-bridge.js"), "utf8");
    const content = await readFile(path.join(extensionRoot, "content.js"), "utf8");
    expect(content).toContain('type: "probe"');
    expect(page).toContain('message?.type === "probe"');
  });
});
