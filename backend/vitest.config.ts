import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: "./test/global-setup.ts",
    // Test files share one real SQLite file (test.db) rather than mocking
    // Prisma, so they must not run concurrently — parallel writers on the
    // same file hit SQLITE_BUSY.
    fileParallelism: false,
    env: {
      DATABASE_URL: "file:./test.db",
    },
  },
});
