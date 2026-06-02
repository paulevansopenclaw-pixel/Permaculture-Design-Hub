import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Replit's own dev-sync infrastructure occasionally throws a
// "Failed to initialize SQLite persistence" error in sandboxed iframes.
// It has nothing to do with our app or database — suppress it so it
// never reaches the runtime-error-modal overlay and blocks the preview.
const REPLIT_SYNC_PATTERNS = ["SQLite persistence", "Failed to connect: sync"];
window.addEventListener("error", (e) => {
  if (REPLIT_SYNC_PATTERNS.some((p) => e.message?.includes(p))) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = String(e.reason?.message ?? e.reason ?? "");
  if (REPLIT_SYNC_PATTERNS.some((p) => msg.includes(p))) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
