import { existsSync, statSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const repoRoot = path.resolve(projectRoot, "..");
const failures = [];
const oldProjectSlug = ["llm", "page", "translator"].join("-");
const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));

await assertNoGeneratedJunk(projectRoot);
await assertNoOldProjectSlug([
  path.join(repoRoot, "README.md"),
  path.join(repoRoot, "README_english.md"),
  path.join(repoRoot, "docs", "vanslate-design.md"),
  path.join(projectRoot, "src"),
  path.join(projectRoot, "scripts"),
  path.join(projectRoot, "test"),
  path.join(projectRoot, "website"),
  path.join(projectRoot, "_locales"),
  path.join(projectRoot, "README.md"),
  path.join(projectRoot, "README_en.md"),
  path.join(projectRoot, "CONTRIBUTE.md"),
  path.join(projectRoot, "CONTRIBUTE_en.md")
]);
await assertWebsiteI18n();
assertWebsiteDownload();

if (failures.length > 0) {
  console.error("Project validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Project validation passed.");

async function assertNoGeneratedJunk(root) {
  for (const file of await walk(root, { ignoredDirs: new Set(["node_modules", "dist"]) })) {
    const basename = path.basename(file);
    if (basename === ".DS_Store") failures.push(`remove macOS metadata file: ${relative(file)}`);
    if (file.includes(`${path.sep}.tmp-tests${path.sep}`) || basename === ".tmp-tests") {
      failures.push(`remove temporary test output: ${relative(file)}`);
    }
  }
}

async function assertNoOldProjectSlug(paths) {
  for (const entry of paths) {
    if (!existsSync(entry)) continue;
    const files = statSync(entry).isDirectory()
      ? await walk(entry, { ignoredDirs: new Set(["node_modules", "dist"]) })
      : [entry];
    for (const file of files) {
      if (!isTextLike(file)) continue;
      const content = await readFile(file, "utf8");
      if (content.includes(oldProjectSlug)) {
        failures.push(`old project slug found in ${relative(file)}`);
      }
    }
  }
}

async function assertWebsiteI18n() {
  const file = path.join(projectRoot, "website", "index.html");
  const html = await readFile(file, "utf8");
  const usedKeys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]);
  const uniqueUsedKeys = new Set(usedKeys);
  const zh = extractObjectKeys(html, "zh");
  const en = extractObjectKeys(html, "en");

  for (const key of uniqueUsedKeys) {
    if (!zh.has(key)) failures.push(`website zh i18n missing key: ${key}`);
    if (!en.has(key)) failures.push(`website en i18n missing key: ${key}`);
  }
  for (const key of zh) {
    if (!en.has(key)) failures.push(`website en i18n missing zh key: ${key}`);
  }
  for (const key of en) {
    if (!zh.has(key)) failures.push(`website zh i18n missing en key: ${key}`);
  }
}

function assertWebsiteDownload() {
  const downloadFile = `vanslate-${packageJson.version}.zip`;
  const download = path.join(projectRoot, "website", "downloads", downloadFile);
  if (!existsSync(download)) {
    failures.push(`website download file is missing: website/downloads/${downloadFile}`);
    return;
  }
  if (statSync(download).size < 1024) {
    failures.push(`website download file is unexpectedly small: website/downloads/${downloadFile}`);
  }
}

function extractObjectKeys(html, name) {
  const start = html.indexOf(`${name}: {`);
  if (start < 0) return new Set();
  const bodyStart = html.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < html.length; index += 1) {
    const char = html[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      const body = html.slice(bodyStart + 1, index);
      return new Set([...body.matchAll(/^\s*([A-Za-z0-9_]+):/gm)].map((match) => match[1]));
    }
  }
  return new Set();
}

async function walk(root, options = {}) {
  const ignoredDirs = options.ignoredDirs || new Set();
  const output = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      output.push(...await walk(fullPath, options));
    } else {
      output.push(fullPath);
    }
  }
  return output;
}

function isTextLike(file) {
  return /\.(cjs|css|html|js|json|md|mjs|ts|txt|yml|yaml)$/i.test(file);
}

function relative(file) {
  return path.relative(repoRoot, file);
}
