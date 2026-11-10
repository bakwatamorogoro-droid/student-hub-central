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
    // es2017, not es2020, and the difference is a blank page rather than a
    // slower one. es2020 keeps `?.` and `??` in the output, and those throw a
    // SyntaxError on Chrome 61-79, Safari 10.1-13.0 and Firefox 60-73. Those
    // engines *can* run a module, so the `noModule` check in index.html stays
    // quiet and the student gets a white screen with no explanation. es2017 is
    // the honest floor: async/await is native from Chrome 55 / Safari 10.1 /
    // Firefox 52, so it costs nothing but the `?.` rewrite (about 1% of the
    // bundle) and it removes the whole gap. Anything below this needs an API
    // polyfill, which public/polyfills.js supplies.
    target: "es2017",
  },
  server: {
    host: "::",
    port: 8080,
    strictPort: false,
  },
});
