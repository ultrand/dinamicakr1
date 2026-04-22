/**
 * Build na Vercel: Prisma generate, migrate (se DATABASE_URL), client + server.
 * Sempre usa a raiz do monorepo (onde está o package.json com workspaces),
 * mesmo se a Vercel rodar o comando a partir de outra pasta.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

function run(label, command, args) {
  const r = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
    cwd: repoRoot,
  });
  if (r.status !== 0) {
    console.error(`[vercel-build] Falha em: ${label}`);
    process.exit(r.status ?? 1);
  }
}

console.log(`[vercel-build] repoRoot=${repoRoot}`);

/**
 * O schema Prisma exige DIRECT_DATABASE_URL. Na Vercel muita gente só cola DATABASE_URL.
 * Se faltar, repetimos DATABASE_URL — funciona quando essa URI já é *direct* (ex. :5432).
 * Se DATABASE_URL for só pooler (:6543) e o migrate falhar, crie DIRECT_DATABASE_URL na Vercel (URI direct do Supabase).
 */
if (process.env.DATABASE_URL && !process.env.DIRECT_DATABASE_URL) {
  process.env.DIRECT_DATABASE_URL = process.env.DATABASE_URL;
  console.warn(
    "[vercel-build] DIRECT_DATABASE_URL ausente → usando o mesmo valor que DATABASE_URL.",
  );
}

run("prisma generate", "npm", ["run", "db:generate", "--workspace=server"]);

if (process.env.DATABASE_URL) {
  run("prisma migrate deploy", "npm", ["run", "db:deploy", "--workspace=server"]);
} else {
  console.warn(
    "[vercel-build] DATABASE_URL ausente — migrate deploy ignorado (normal só em dev local). Na Vercel a variável deve estar definida.",
  );
}

run("vite build (client)", "npm", ["run", "build", "--workspace=client"]);
run("tsc (server)", "npm", ["run", "build", "--workspace=server"]);
