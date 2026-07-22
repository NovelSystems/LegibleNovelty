import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirror tsconfig's "@/*" path alias so lib/ imports resolve under vitest.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  // Use React's automatic JSX runtime so .tsx test/component files don't need
  // `React` in scope (matches Next's JSX handling).
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    // Default environment is node; the badge component test opts into jsdom
    // per-file with a `// @vitest-environment jsdom` pragma.
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Database connection + Mailpit polling need more headroom than the 5s
    // default.
    testTimeout: 30000,
    hookTimeout: 30000,
    // Run test files sequentially. Several Stage 1 flows (graduation, token
    // refresh, display-name reuse) touch global tables or the shared Mailpit
    // mailbox; serial files plus per-test unique identifiers keep them from
    // racing each other against the single TEST_DATABASE_URL.
    fileParallelism: false,
  },
});
