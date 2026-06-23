import esbuild from "esbuild";

const common = {
  target: "es2022",
  sourcemap: false,
  logLevel: "info",
  legalComments: "none"
};

await esbuild.build({
  ...common,
  entryPoints: ["src/entries/background.ts"],
  outfile: "background.js",
  bundle: true,
  format: "iife",
  platform: "browser"
});

await Promise.all([
  esbuild.build({
    ...common,
    entryPoints: ["src/entries/content.ts"],
    outfile: "content.js",
    bundle: true,
    format: "iife",
    platform: "browser"
  }),
  esbuild.build({
    ...common,
    entryPoints: ["src/entries/options.ts"],
    outfile: "options.js",
    bundle: true,
    format: "iife",
    platform: "browser"
  }),
  esbuild.build({
    ...common,
    entryPoints: ["src/entries/popup.ts"],
    outfile: "popup.js",
    bundle: true,
    format: "iife",
    platform: "browser"
  }),
  esbuild.build({
    ...common,
    entryPoints: ["src/entries/i18n.ts"],
    outfile: "i18n.js",
    bundle: false,
    format: "esm",
    platform: "browser"
  })
]);

