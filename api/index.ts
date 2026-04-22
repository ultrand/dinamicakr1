/**
 * Entrada serverless da API na Vercel.
 * Usa import() dinâmico para evitar conflito ESM/CJS no runtime da função.
 */
let appPromise: Promise<(req: unknown, res: unknown) => unknown> | null = null;

async function getApp() {
  if (!appPromise) {
    appPromise = import("../server/src/app.js").then((m) => m.createApp());
  }
  return appPromise;
}

export default async function handler(req: unknown, res: unknown) {
  const app = await getApp();
  return app(req, res);
}
