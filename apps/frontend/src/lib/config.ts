// Central base-URL decision for every frontend -> backend HTTP call.
//
// Dev:  Vite proxies /api/v1/** and /health to the Rust backend
//       (see apps/frontend/vite.config.ts), so same-origin relative paths
//       work without any base URL.
// Prod: there is no current prod deployment; when the static bundle is
//       served, it is expected to be served from the same origin as the
//       backend, so same-origin relative paths still work.
//
// VITE_API_BASE is an escape hatch for environments where the frontend is
// served from a different origin than the backend. The empty-string default
// keeps every request same-origin.
const envBase = import.meta.env.VITE_API_BASE;
export const API_BASE: string = typeof envBase === "string" ? envBase : "";
