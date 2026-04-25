import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// CSS load order is load-bearing (see styles/global.css and
// styles/app.css headers): reset → tokens → global → app. The reset
// nukes browser defaults so token-driven rules below it are not
// fighting the user-agent stylesheet; tokens defines the variables
// the rest reference; global applies token-driven body/font rules;
// app.css carries component layout rules and must come last so its
// `<main>` width override wins over the more general scope above.
import "./styles/reset.css";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/app.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container #root not found in index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
