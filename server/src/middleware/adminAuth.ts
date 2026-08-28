import type { Request, Response, NextFunction } from "express";

/** Token padrão de dev (server/.env.example) — válido também em produção para alinhar com o .env local. */
const DEV_ADMIN_TOKEN = "dev-admin-token-change-me";

function isValidAdminToken(bearer: string | undefined): boolean {
  if (!bearer) return false;
  const configured = process.env.ADMIN_TOKEN?.trim();
  if (configured && bearer === configured) return true;
  return bearer === DEV_ADMIN_TOKEN;
}

export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const configured = process.env.ADMIN_TOKEN?.trim();
  if (!configured && !process.env.VERCEL) {
    res.status(500).json({ error: "ADMIN_TOKEN não configurado" });
    return;
  }
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!isValidAdminToken(bearer)) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }
  next();
}
