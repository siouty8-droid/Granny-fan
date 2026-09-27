import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: { port: 5173, host: true },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4000,
    sourcemap: false,
  },
  optimizeDeps: {
    // Le wasm de Recast est embarqué dans le JS (build "compat") : pas de fichier externe.
    exclude: ["@recast-navigation/core", "@recast-navigation/generators", "@recast-navigation/wasm"],
  },
});
