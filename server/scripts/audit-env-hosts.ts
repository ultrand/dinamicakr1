import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const dir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(dir, "../.env") });

function hostLabel(url: string) {
  if (!url) return "missing";
  if (url.includes("localhost") || url.includes("127.0.0.1")) return "LOCAL (Docker)";
  if (url.includes("supabase")) return "SUPABASE (remoto)";
  return "OUTRO";
}

function hostRef(url: string) {
  try {
    const u = new URL(url.replace(/^postgresql:/, "http:"));
    return u.hostname;
  } catch {
    return "?";
  }
}

const current = process.env.DATABASE_URL ?? "";
let backup = "";
try {
  const bak = readFileSync(path.join(dir, "../.env.supabase.bak"), "utf-8");
  backup = bak.match(/DATABASE_URL="([^"]+)"/)?.[1] ?? "";
} catch {
  backup = "";
}

console.log("current .env:", hostLabel(current), "|", hostRef(current));
console.log("backup .env:", hostLabel(backup), "|", hostRef(backup));
console.log("same_host:", hostRef(current) === hostRef(backup) && hostRef(current) !== "?");
