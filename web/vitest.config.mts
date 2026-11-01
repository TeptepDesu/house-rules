import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // server-only throws outside React Server Components; tests are server code, so stub it.
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // DB tests start an in-process Postgres (PGlite, WASM) per file; under parallel load that
    // can take several seconds, so allow more than the 5s default.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", "e2e/**", ".next/**", "test/integration/**"],
  },
});
