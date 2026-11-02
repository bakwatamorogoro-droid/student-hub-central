import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "node:path";

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  css: {
    transformer: "lightningcss",
    lightningcss: {
      // Tailwind 4 emits `oklch()` and `color-mix()`, which Chrome <111,
      // Safari <16.4 and Firefox <113 reject. Downlevelling rewrites each
      // colour to a hex fallback and upgrades it inside `@supports`, so the
      // palette still paints on older Android and iOS browsers.
      targets: {
        safari: (13 << 16) | (0 << 8),
        chrome: (80 << 16),
        firefox: (78 << 16),
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    // es2020 (Chrome 87 / Safari 14 / Firefox 78) is the honest floor for the
    // JS: `String.prototype.replaceAll` is used in the i18n layer and that is
    // Chrome 85. Anything older needs an API polyfill, not a syntax downlevel.
    target: "es2020",
  },
  server: {
    host: "::",
    port: 8080,
    strictPort: false,
  },
});
