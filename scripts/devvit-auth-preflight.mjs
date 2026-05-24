import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    command: [command, ...args].join(" "),
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

const version = run("npx", ["devvit", "--version"]);
const whoami = run("npx", ["devvit", "whoami"]);
const authenticated = whoami.status === 0 && !/not currently logged in/i.test(`${whoami.stdout}\n${whoami.stderr}`);
const status = authenticated ? "authenticated" : "auth-blocked";
const output = {
  status,
  checkedAt: new Date().toISOString(),
  version,
  whoami,
  nextAction: authenticated
    ? "Run npm run devvit:upload and npm run devvit:playtest against a test subreddit."
    : "Devvit CLI is not logged in; live upload/playtest and Redis proof remain blocked.",
};

const outputDir = path.resolve("outputs/e2e");
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "devvit-auth-preflight.json"), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

if (!authenticated) process.exitCode = 2;
