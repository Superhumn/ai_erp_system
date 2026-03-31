import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    extends: "./vite.config.ts",
    test: {
      name: "server",
      environment: "node",
      include: ["server/**/*.test.ts"],
    },
  },
  {
    extends: "./vite.config.ts",
    test: {
      name: "client",
      environment: "jsdom",
      include: ["client/src/**/*.test.ts", "client/src/**/*.test.tsx"],
      setupFiles: ["client/src/test/setup.ts"],
    },
  },
]);
