// `bun test` preload: installs a happy-dom Window as the global DOM.
//
// Activated automatically by `bunfig.toml`'s [test] preload entry, so no
// CLI flags are required. This is the only setup file; all test-scoped
// helpers live inside the test file itself.
//
// happy-dom is chosen over jsdom because its Bun integration is smaller
// and faster to boot, and it does not require node polyfills that Bun
// does not ship natively.
//
// `GlobalWindow` (not the bare `Window`) is used so that JS built-ins
// like `SyntaxError` are installed on the window object. happy-dom's
// SelectorParser eagerly calls `new this.window.SyntaxError(...)` inside
// `querySelectorAll`, which throws on a plain `Window` where
// `SyntaxError` is undefined.
//
// happy-dom v20 removed the stand-alone `GlobalRegistrator` helper, so
// we install the globals we need by hand. Only the handful of DOM
// primitives React 19 + @testing-library/react 16 touch during
// render/cleanup are copied onto `globalThis`; everything else on
// `Window` remains reachable via `globalThis.window`.
import { GlobalWindow } from "happy-dom";

const globalScope = globalThis as unknown as Record<string, unknown>;

if (!globalScope.window) {
  const happyWindow = new GlobalWindow({ url: "http://localhost/" });
  globalScope.window = happyWindow;
  globalScope.document = happyWindow.document;
  globalScope.navigator = happyWindow.navigator;
  globalScope.HTMLElement = happyWindow.HTMLElement;
  globalScope.Element = happyWindow.Element;
  globalScope.Node = happyWindow.Node;
  globalScope.Event = happyWindow.Event;
  globalScope.CustomEvent = happyWindow.CustomEvent;
  globalScope.getComputedStyle = happyWindow.getComputedStyle.bind(happyWindow);
  globalScope.requestAnimationFrame =
    happyWindow.requestAnimationFrame.bind(happyWindow);
  globalScope.cancelAnimationFrame =
    happyWindow.cancelAnimationFrame.bind(happyWindow);
  // M4 Chunk E1: focus-trap-react brings in `tabbable`, which calls
  // `new MutationObserver(...)` at module load. happy-dom exposes
  // `MutationObserver` on the Window object but Bun does not pick it
  // up via globalThis automatically, so install it explicitly here
  // alongside the other DOM primitives.
  globalScope.MutationObserver = (
    happyWindow as unknown as { MutationObserver: typeof MutationObserver }
  ).MutationObserver;
}
