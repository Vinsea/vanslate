import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  testMatch: /.*e2e\.spec\.ts/,
  timeout: 20_000,
  fullyParallel: false,
  reporter: [
    ["line"],
    ["html", { outputFolder: "reports/playwright-html", open: "never" }]
  ],
  outputDir: "reports/playwright-artifacts",
  use: {
    channel: "chrome",
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off"
  }
});
