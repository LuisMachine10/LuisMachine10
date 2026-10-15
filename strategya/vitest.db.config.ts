import { defineConfig } from "vitest/config";

// Pruebas contra un Postgres real (local o el servicio de CI). Ver README · «Pruebas».
export default defineConfig({
  test: {
    include: ["pruebas/db/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
