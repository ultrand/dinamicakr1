import type { Request, Response, NextFunction } from "express";

export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    res.status(500).json({ error: "ADMIN_TOKEN não configurado" });
    return;
  }
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const query = typeof req.query.token === "string" ? req.query.token : undefined;
  const sent = bearer ?? query;
  if (sent !== token) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }
  next();
}
