import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { ensureCodexRuntimeDirectory } from "../src/codex-runtime.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("Codex runtime directory", () => {
  it("creates an independent empty Git repository and is idempotent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-codex-"));
    roots.push(root);
    const requested = path.join(root, "nested", "runtime");

    const first = await ensureCodexRuntimeDirectory(requested);
    const second = await ensureCodexRuntimeDirectory(requested);
    const gitDirectory = await stat(path.join(first, ".git"));
    const { stdout } = await execFileAsync("git", ["-C", first, "rev-parse", "--show-toplevel"], { windowsHide: true });

    expect(first).toBe(path.resolve(requested));
    expect(second).toBe(first);
    expect(gitDirectory.isDirectory()).toBe(true);
    expect(path.resolve(stdout.trim())).toBe(first);
  });
});
