import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App.jsx";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/forms.css";
import "./styles/login.css";
import "./styles/dashboard.css";
import "./styles/responsive.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    let isRefreshing = false;

    function announceUpdate(worker) {
      window.dispatchEvent(new CustomEvent("app-update-available", { detail: { worker } }));
    }

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (isRefreshing) {
        return;
      }

      isRefreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          announceUpdate(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) {
            return;
          }

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              announceUpdate(newWorker);
            }
          });
        });
      })
      .catch((error) => {
        console.error("Service worker registration failed", error);
      });
  });
}
