import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest configuration.
 *
 * The `@/*` alias mirrors `compilerOptions.paths` in tsconfig.json so tests
 * import application modules exactly the way the application does.
 *
 * `environment: "node"` is required, not cosmetic: `lib/auth.ts` and every
 * route handler under app/api run on the Node runtime and use `node:crypto`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Tests must never depend on a live database or the real network.
    env: {
      NODE_ENV: "test",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["app/**/*.ts", "lib/**/*.ts", "db/**/*.ts"],
      exclude: ["**/*.d.ts"],
    },
  },
});