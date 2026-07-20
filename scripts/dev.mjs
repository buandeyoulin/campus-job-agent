import { spawn } from "node:child_process";
import { createNpmInvocation } from "./dev-invocation.mjs";

const server = createNpmInvocation(["run", "dev", "-w", "@campus-job-agent/server"]);
const web = createNpmInvocation(["run", "dev", "-w", "@campus-job-agent/web"]);
const children = [
  spawn(server.command, server.args, { stdio: "inherit" }),
  spawn(web.command, web.args, { stdio: "inherit" }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = exitCode;
}

for (const child of children) {
  child.on("exit", (code) => {
    if (!stopping && code !== 0) stop(code ?? 1);
  });
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
