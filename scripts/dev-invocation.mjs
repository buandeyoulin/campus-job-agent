export function createNpmInvocation(args, options = {}) {
  const platform = options.platform ?? process.platform;
  const execPath = options.execPath ?? process.execPath;
  const npmExecPath = options.npmExecPath ?? process.env.npm_execpath;
  if (npmExecPath) return { command: execPath, args: [npmExecPath, ...args] };
  if (platform === "win32") {
    return { command: options.comspec ?? process.env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", "npm", ...args] };
  }
  return { command: "npm", args };
}
