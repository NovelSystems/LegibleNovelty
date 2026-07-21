import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Database connection + Mailpit polling need more headroom than the 5s
    // default.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
