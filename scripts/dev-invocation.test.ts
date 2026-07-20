import { describe, expect, it } from "vitest";
import { createNpmInvocation } from "./dev-invocation.mjs";

describe("development npm invocation", () => {
  it("uses Node to execute npm CLI on Windows instead of spawning npm.cmd", () => {
    expect(createNpmInvocation(["run", "dev"], {
      platform: "win32",
      execPath: "C:\\node\\node.exe",
      npmExecPath: "C:\\npm\\npm-cli.js",
    })).toEqual({
      command: "C:\\node\\node.exe",
      args: ["C:\\npm\\npm-cli.js", "run", "dev"],
    });
  });

  it("uses cmd.exe as the Windows fallback when npm CLI metadata is unavailable", () => {
    expect(createNpmInvocation(["run", "dev"], {
      platform: "win32",
      execPath: "C:\\node\\node.exe",
      npmExecPath: "",
      comspec: "C:\\Windows\\System32\\cmd.exe",
    })).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "npm", "run", "dev"],
    });
  });
});
