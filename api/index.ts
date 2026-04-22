/**
 * Entrada serverless da API na Vercel.
 * Usa import() dinâmico para evitar conflito ESM/CJS no runtime da função.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

let appPromise: Promise<(req: IncomingMessage, res: ServerResponse) => void> | null = null;

async function getApp() {
  if (!appPromise) {
    appPromise = import("../server/src/app.js").then((m) => {
      console.log("[api] app module loaded, DATABASE_URL present:", !!process.env.DATABASE_URL);
      return m.createApp() as (req: IncomingMessage, res: ServerResponse) => void;
    });
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (e) {
    console.error("[api] Failed to load app:", e);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "App init failed", details: String(e) }));
  }
}
