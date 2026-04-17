import "./env.js";
import cors from "cors";
import express from "express";
import { corsOptionsFromEnv } from "./corsConfig.js";
import { adminRouter } from "./routes/admin.js";
import { publicRouter } from "./routes/public.js";

/** App Express (API). Reutilizado no Node local/Docker e na Vercel (serverless). */
export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(cors(corsOptionsFromEnv()));
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, t: new Date().toISOString() });
  });

  app.use("/api/public", publicRouter);
  app.use("/api/admin", adminRouter);

  return app;
}
