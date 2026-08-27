import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: process.env.VERIDEX_E2E_BASE_URL,
    browserName: "firefox",
    headless: true,
  },
  workers: 1,
});
