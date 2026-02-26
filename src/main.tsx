import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import "./App.css";
import App from "./App";
import usePersistStore from "./stores/persistStore";

const store = usePersistStore.getState();

const rootDOM = document.getElementById("root");

rootDOM?.setAttribute("data-theme", store.theme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
