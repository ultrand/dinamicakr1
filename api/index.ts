/**
 * Ponto de entrada serverless na Vercel: mesma API Express, sem segundo serviço.
 * Variáveis: DATABASE_URL (Supabase), ADMIN_TOKEN, etc. — configuradas no painel da Vercel.
 */
import { createApp } from "../server/src/app";

export default createApp();
