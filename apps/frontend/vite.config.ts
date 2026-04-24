import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev topology (see docs/dev-commands.md):
//   Backend  : http://127.0.0.1:4000  (Rust, must be running separately)
//   Frontend : http://127.0.0.1:4100  (this Vite dev server)
// `/api/v1/**` and `/health` are proxied by Vite to the backend so the
// browser can call backend endpoints using same-origin paths without CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4100,
    strictPort: true,
    proxy: {
      "/api/v1": {
        target: "http://127.0.0.1:4000",
        changeOrigin: false,
      },
      "/health": {
        target: "http://127.0.0.1:4000",
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4100,
    strictPort: true,
  },
});
