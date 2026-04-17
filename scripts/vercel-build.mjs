/**
 * Build usado na Vercel: gera Prisma, aplica migrações se houver DATABASE_URL,
 * builda client + server. Sem DATABASE_URL (teste local), pula o migrate.
 */
import { spawnSync } from "node:child_process";

function run(label, command, args) {
  const r = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(`[vercel-build] Falha em: ${label}`);
    process.exit(r.status ?? 1);
  }
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
