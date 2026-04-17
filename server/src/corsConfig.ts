import type { CorsOptions } from "cors";

/**
 * CORS_ORIGINS: lista separada por vírgula (ex.: https://app.vercel.app,https://meudominio.com).
 * Vazio ou *: reflete a origem do pedido (adequado quando front e API são o mesmo deploy).
 */
export function corsOptionsFromEnv(): CorsOptions {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw || raw === "*") {
    return { origin: true };
  }
  const allowed = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return {
    origin(origin, callback) {
      if (!origin || allowed.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
    },
  };
}
