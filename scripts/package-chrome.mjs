import { copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = new URL("../", import.meta.url).pathname;
const repo = new URL("../../", import.meta.url).pathname;
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const version = packageJson.version;
const packageDir = `${root}packages`;
const legacyPackageDir = `${repo}packages`;
const outDir = `${packageDir}/vanslate-unpacked`;
const zip = `${packageDir}/vanslate-${version}.zip`;
const crx = `${packageDir}/vanslate-${version}.crx`;
const stablePem = `${packageDir}/vanslate.pem`;
const versionPem = `${packageDir}/vanslate-${version}.pem`;
const legacyPem = `${legacyPackageDir}/vanslate-1.0.0.pem`;
const websiteCrx = `${root}website/downloads/vanslate-${version}.crx`;
const websiteZip = `${root}website/downloads/vanslate-${version}.zip`;
const keyTmp = `/tmp/vanslate-${version}.pem`;

await mkdir(packageDir, { recursive: true });
const existingKey = [stablePem, versionPem, `${legacyPackageDir}/vanslate.pem`, `${legacyPackageDir}/vanslate-${version}.pem`, legacyPem].find((file) => existsSync(file));
if (existingKey) await copyFile(existingKey, keyTmp);
await rm(outDir, { recursive: true, force: true });
await removeOldPackages(packageDir);
await removeOldPackages(`${root}website/downloads`);
await mkdir(outDir, { recursive: true });

const rsync = spawnSync("rsync", [
  "-a",
  "--exclude", ".DS_Store",
  "--exclude", ".gitignore",
  "--exclude", ".tmp-tests",
  "--exclude", "node_modules",
  "--exclude", "packages",
  "--exclude", "src",
  "--exclude", "scripts",
  "--exclude", "test",
  "--exclude", "reports",
  "--exclude", "website",
  "--exclude", "docs",
  "--exclude", "README.md",
  "--exclude", "README_en.md",
  "--exclude", "CONTRIBUTE.md",
  "--exclude", "CONTRIBUTE_en.md",
  "--exclude", "changelog.md",
  "--exclude", "LICENSE",
  "--exclude", "CHROME_WEB_STORE_SUBMISSION.md",
  "--exclude", "CHROME_WEB_STORE_PRIVACY.md",
  "--exclude", "manifest.firefox.json",
  "--exclude", "package.json",
  "--exclude", "package-lock.json",
  "--exclude", "playwright.config.ts",
  "--exclude", "tsconfig.json",
  "--exclude", "icons/vanslate.png",
  "--exclude", "icons/banner.png",
  "--exclude", "icons/ChatGPT Image 2026年5月5日 21_31_21.png",
  "--exclude", "icons/ChatGPT Image 2026年5月5日 22_52_18.png",
  "--exclude", "icons/ChatGPT Image 2026年5月5日 23_18_12.png",
  root,
  `${outDir}/`
], { stdio: "inherit" });
if (rsync.status !== 0) process.exit(rsync.status ?? 1);

const zipResult = spawnSync("zip", ["-qr", zip, "."], { cwd: outDir, stdio: "inherit" });
if (zipResult.status !== 0) process.exit(zipResult.status ?? 1);

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeArgs = [`--pack-extension=${outDir}`];
if (existsSync(keyTmp)) chromeArgs.push(`--pack-extension-key=${keyTmp}`);
const pack = spawnSync(chromePath, chromeArgs, { stdio: "inherit" });
if (pack.status !== 0) process.exit(pack.status ?? 1);

await copyFile(`${outDir}.crx`, crx);
await mkdir(`${root}website/downloads`, { recursive: true });
await copyFile(crx, websiteCrx);
await copyFile(zip, websiteZip);
if (existsSync(keyTmp)) {
  await copyFile(keyTmp, stablePem);
  await copyFile(keyTmp, versionPem);
} else {
  await copyFile(`${outDir}.pem`, stablePem);
  await copyFile(`${outDir}.pem`, versionPem);
}
await rm(`${outDir}.crx`, { force: true });
await rm(`${outDir}.pem`, { force: true });

const testZip = spawnSync("unzip", ["-t", zip], { stdio: "inherit" });
if (testZip.status !== 0) process.exit(testZip.status ?? 1);

async function removeOldPackages(directory) {
  await mkdir(directory, { recursive: true });
  const files = await readdir(directory);
  await Promise.all(files
    .filter((file) => /^vanslate-.*\.(crx|zip)$/.test(file))
    .map((file) => rm(`${directory}/${file}`, { force: true })));
}
