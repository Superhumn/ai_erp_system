import path from "path";
import { defineWorkspace } from "vitest/config";

const root = import.meta.dirname;

export default defineWorkspace([
  {
    extends: "./vite.config.ts",
    test: {
      name: "server",
      root,
      environment: "node",
      include: ["server/**/*.test.ts"],
    },
  },
  {
    extends: "./vite.config.ts",
    test: {
      name: "client",
      root,
      environment: "jsdom",
      include: ["client/src/**/*.test.ts", "client/src/**/*.test.tsx"],
      setupFiles: [path.resolve(root, "client/src/test/setup.ts")],
    },
  },
]);
