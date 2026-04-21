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
