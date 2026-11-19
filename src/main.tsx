import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App.tsx";
import "./index.css";
import { setUpdateAvailable } from "./platform/updates.ts";
import { AppStoreProvider } from "./store/AppStore.tsx";

const updateSW = registerSW({
  onNeedRefresh() {
    setUpdateAvailable(() => void updateSW(true));
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppStoreProvider>
      <App />
    </AppStoreProvider>
  </StrictMode>,
);
