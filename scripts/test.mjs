import { rm } from "node:fs/promises";
import esbuild from "esbuild";

await rm(".tmp-tests", { recursive: true, force: true });
await esbuild.build({
  entryPoints: ["test/core.test.ts"],
  outfile: ".tmp-tests/core.test.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: false,
  logLevel: "silent"
});

const { spawnSync } = await import("node:child_process");
const result = spawnSync(process.execPath, ["--test", ".tmp-tests/core.test.mjs"], {
    stdio: "inherit"
});
const status = result.status ?? 1;

await rm(".tmp-tests", { recursive: true, force: true });
process.exitCode = status;
