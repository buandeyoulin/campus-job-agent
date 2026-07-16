import { execFile } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function hasOwnGitDirectory(directory: string): Promise<boolean> {
  try {
    return (await stat(path.join(directory, ".git"))).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function ensureCodexRuntimeDirectory(directory: string): Promise<string> {
  const resolved = path.resolve(directory);
  await mkdir(resolved, { recursive: true });
  if (!(await hasOwnGitDirectory(resolved))) {
    await execFileAsync("git", ["init", "--quiet", resolved], { windowsHide: true });
  }
  return resolved;
}
