import { spawnSync } from "node:child_process";
const r = spawnSync(process.execPath, ["--test", "tests/browser.test.mjs"], {
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
});
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
if (r.status !== 0) {
  const error = (
    r.stderr ||
    r.stdout ||
    r.error?.message ||
    "Browser test failed"
  )
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
  console.log(`::error title=Browser regressions::${error}`);
  process.exit(r.status || 1);
}
