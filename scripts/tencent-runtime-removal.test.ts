import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

async function exists(relativePath: string): Promise<boolean> {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

describe("removed Tencent-specific job runtime", () => {
  it("does not keep the old workspace, client, source adapter, routes, or probes", async () => {
    const removedFiles = [
      "apps/web/src/components/JobsWorkspace.tsx",
      "apps/web/src/components/JobsWorkspace.test.tsx",
      "apps/web/src/jobs-api.ts",
      "packages/sources/src/tencent.ts",
      "packages/sources/test/tencent.test.ts",
      "packages/sources/test/fixtures/tencent.json",
    ];
    expect((await Promise.all(removedFiles.map(async (file) => [file, await exists(file)])))
      .filter(([, present]) => present)).toEqual([]);

    const runtimeFiles = [
      "apps/web/src/App.tsx",
      "apps/server/src/jobs-routes.ts",
      "apps/server/src/jobs-service.ts",
      "apps/server/src/services.ts",
      "packages/sources/src/index.ts",
      "scripts/run-phase0.mts",
    ];
    const forbidden = /JobsWorkspace|scan\/tencent|fetchTencent|fetchTencentJobs|probeTencent|更新腾讯公开职位|发现校招与实习岗位/i;
    const matches: string[] = [];
    for (const file of runtimeFiles) {
      const content = await readFile(path.join(root, file), "utf8");
      if (forbidden.test(content)) matches.push(file);
    }
    expect(matches).toEqual([]);
  });
});
