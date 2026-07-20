import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "apps/**/*.test.tsx", "packages/**/*.test.ts", "scripts/**/*.test.ts"],
    coverage: { provider: "v8", reporter: ["text", "json-summary"] },
  },
});
