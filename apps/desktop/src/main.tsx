import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./tailwind.css";
import "@coworkany/workbench-ui/styles.css";
import "./styles.css";
import "./native-questions.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
