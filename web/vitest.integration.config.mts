import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Slow tests against a real local NEAR sandbox + the real vault wasm. `pnpm test:integration`.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
