import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "engine/**/__tests__/**/*.test.ts",
      "sync/**/__tests__/**/*.test.ts",
      "lib/**/__tests__/**/*.test.ts",
    ],
    globals: false,
  },
});
