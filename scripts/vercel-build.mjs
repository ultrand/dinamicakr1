/**
 * Build na Vercel: só gera o Prisma Client e compila o código.
 * NÃO aplica migrações — isso é feito uma vez com: npm run db:setup
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
run("vite build (client)", "npm", ["run", "build", "--workspace=client"]);
run("tsc (server)", "npm", ["run", "build", "--workspace=server"]);
