import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Root } from "./Root.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
