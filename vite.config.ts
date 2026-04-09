import { defineConfig } from "vite-plus";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

const isTest = process.env.VITEST === "true";

const config = defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    ...(isTest ? [] : [nitro({ rollupConfig: { external: [/^@sentry\//] } }), tanstackStart()]),
    viteReact(),
  ],
});

export default config;
