import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const debug = process.env.DEBUG;

if (debug) {
  const namespaces = debug
    .split(",")
    .map((namespace) => namespace.trim())
    .filter((namespace) => namespace && !namespace.startsWith("prisma"))
    .filter((namespace) => !namespace.startsWith("-prisma"));

  process.env.DEBUG = namespaces.join(",");
} else {
  delete process.env.DEBUG;
}

const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], {
  stdio: ["inherit", "pipe", "pipe"],
  env: process.env
});

let suppressErrorBlock = false;

function isNextOutput(line) {
  const value = line.trimStart();
  return (
    /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s/.test(value) ||
    /^(?:[✓○]|\u2713|\u25CB)?\s*(?:Compiled|Compiling|Ready|Starting)\b/.test(value) ||
    /^(?:▲|△|- Local:|- Network:|- Environments:)/.test(value)
  );
}

function forwardWithoutApplicationLogs(stream, target) {
  let pending = "";

  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";

    for (const line of lines) {
      const value = line.trimStart();

      if (value.startsWith("prisma:error") || value.startsWith("[auth][error]") || value.startsWith("[auth][cause]")) {
        suppressErrorBlock = true;
        continue;
      }

      if (value.startsWith("prisma:") || value.startsWith("[auth][details]")) continue;

      if (suppressErrorBlock) {
        if (!isNextOutput(line)) continue;
        suppressErrorBlock = false;
      }

      target.write(`${line}\n`);
    }
  });

  stream.on("end", () => {
    if (pending && !suppressErrorBlock && !pending.trimStart().startsWith("prisma:")) {
      target.write(pending);
    }
  });
}

if (child.stdout) forwardWithoutApplicationLogs(child.stdout, process.stdout);
if (child.stderr) forwardWithoutApplicationLogs(child.stderr, process.stderr);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
