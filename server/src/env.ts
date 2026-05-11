import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

/** Pasta `server/` (`.env`, Prisma, etc.). */
export const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Raiz do monorepo (alguns devs colocam `DATABASE_URL` só no `.env` da raiz). */
const repoRootDir = path.join(serverDir, "..");

dotenv.config({ path: path.join(repoRootDir, ".env") });
dotenv.config({ path: path.join(serverDir, ".env"), override: true });

/**
 * CWD em `server/` para Prisma (local/Docker). Na Vercel (serverless) não mudamos
 * o cwd — o cliente Prisma já veio gerado no build.
 */
if (!process.env.VERCEL) {
  process.chdir(serverDir);
}
