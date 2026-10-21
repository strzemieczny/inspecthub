import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AppUpdateNotice } from "./components/AppUpdateNotice";
import { startAppUpdates } from "./lib/app-updates";
import { I18nProvider } from "./lib/i18n.tsx";

startAppUpdates();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <App />
      <AppUpdateNotice />
    </I18nProvider>
  </StrictMode>,
);
