import { createRoot } from "react-dom/client";

import App from "@/App";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/index.css";

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root element not found");
}

createRoot(container).render(
  <TooltipProvider>
    <App />
  </TooltipProvider>,
);
