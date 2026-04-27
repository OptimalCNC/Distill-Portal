import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// CSS load order is load-bearing. The three global sheets are imported
// FIRST so Vite emits them ahead of the feature-local sibling sheets
// pulled in transitively via `App`'s import graph. `reset.css` nukes
// browser defaults; `tokens.css` defines the CSS custom properties the
// rest reference (including under `prefers-color-scheme: dark`);
// `global.css` applies token-driven body / `<main>` shell rules and
// the four global utility classes (`.muted`, `.mono`, `.stack`,
// `.empty`). Feature-local CSS is imported by sibling `.tsx`/`.ts`
// files (e.g. `SessionsTable.tsx` imports `./SessionsTable.css`); they
// land after the globals in the dist bundle so feature rules can
// override globals where needed. The Phase 4 Milestone 6 retirement
// of `app.css` collapsed the prior monolith into per-feature siblings;
// see `progress/phase-4.progress.md` Chunk G for the migration map.
import "./styles/reset.css";
import "./styles/tokens.css";
import "./styles/global.css";

import { App } from "./App";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container #root not found in index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
