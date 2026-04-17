import fs from "fs";
import path from "path";
import express from "express";
import { fileURLToPath } from "url";
import { createApp } from "./app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = createApp();

/** Fora da Vercel, o mesmo processo serve o build estático do Vite. */
if (!process.env.VERCEL) {
  const clientDist = path.join(__dirname, "../../client/dist");
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }
}

const port = Number(process.env.PORT ?? 3001);
if (!process.env.VERCEL) {
  app.listen(port, "0.0.0.0", () => {
    const pub = process.env.PUBLIC_URL?.trim();
    console.log(
      pub
        ? `Servidor em ${pub} (porta interna ${port})`
        : `API + SPA em http://0.0.0.0:${port}`,
    );
  });
}
