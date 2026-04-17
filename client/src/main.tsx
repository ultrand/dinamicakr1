import React from "react";

import ReactDOM from "react-dom/client";

import { BrowserRouter } from "react-router-dom";

import { App } from "./App";

import { ErrorBoundary } from "./ErrorBoundary";

import "./styles.css";

/* Tema CIAP — ativa as variáveis de cor do design system */
document.documentElement.classList.add("ciap-theme-light");



const rootEl = document.getElementById("root");

if (!rootEl) {

  document.body.innerHTML = "<p>Elemento #root não encontrado.</p>";

} else {

  ReactDOM.createRoot(rootEl).render(

    <React.StrictMode>

      <ErrorBoundary>

        <BrowserRouter>

          <App />

        </BrowserRouter>

      </ErrorBoundary>

    </React.StrictMode>,

  );

}

