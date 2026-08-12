import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Pages } from "./pages.tsx";
import { TrpcProvider } from "./providers/trpc.tsx";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element was not found.");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <TrpcProvider>
        <Pages />
      </TrpcProvider>
    </BrowserRouter>
  </StrictMode>,
);
