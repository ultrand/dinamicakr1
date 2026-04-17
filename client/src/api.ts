/** Em produção no Vercel, defina VITE_API_BASE com a URL do backend (ex.: https://api.seudominio.com), sem barra no final. */
const base = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";

function apiHint() {
  if (import.meta.env.DEV) {
    return " Verifique se o backend está rodando (na raiz: npm run dev — API em :3001). Abra o app em http://localhost:5173";
  }
  return " Verifique VITE_API_BASE no build e se a API está no ar com CORS liberado para este domínio.";
}

function messageFromErrorBody(t: string, status: number) {
  let msg = t || `HTTP ${status}`;
  try {
    const j = JSON.parse(t) as { error?: string; details?: string };
    if (typeof j.error === "string") msg = j.error;
    if (typeof j.details === "string") msg = `${msg} — ${j.details}`;
  } catch {
    /* texto plano */
  }
  return msg;
}

export async function apiGet<T>(path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let r: Response;
  try {
    r = await fetch(`${base}${path}`, { headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha de rede";
    throw new Error(`${msg}.${apiHint()}`);
  }
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${messageFromErrorBody(t, r.status)}${apiHint()}`);
  }
  try {
    return (await r.json()) as T;
  } catch {
    throw new Error(`Resposta inválida (não é JSON).${apiHint()}`);
  }
}

export async function apiSend<T>(
  path: string,
  method: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let r: Response;
  try {
    r = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha de rede";
    throw new Error(`${msg}.${apiHint()}`);
  }
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${messageFromErrorBody(t, r.status)}${apiHint()}`);
  }
  const ct = r.headers.get("content-type");
  if (ct?.includes("application/json")) return r.json() as Promise<T>;
  return undefined as T;
}

export function downloadUrl(path: string, token: string) {
  const origin = base || window.location.origin;
  const u = new URL(path, origin);
  u.searchParams.set("token", token);
  window.open(u.toString(), "_blank");
}
