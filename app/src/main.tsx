import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { applyTheme } from "./store/useAppSettingsStore";

// Apply persisted theme before first render
try {
  const raw = localStorage.getItem('convertalps-app-preferences');
  const prefs = raw ? JSON.parse(raw) : null;
  applyTheme(prefs?.state?.theme ?? 'dark');
} catch { applyTheme('dark'); }

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
