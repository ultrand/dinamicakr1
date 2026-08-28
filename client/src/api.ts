/** Em produção no Vercel, defina VITE_API_BASE com a URL do backend (ex.: https://api.seudominio.com), sem barra no final. */
const base = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";

function apiHint(status?: number) {
  if (status === 401) {
    if (import.meta.env.DEV) {
      return " Token incorreto. Use o ADMIN_TOKEN de server/.env (padrão: dev-admin-token-change-me).";
    }
    return " Token incorreto. Em produção use o ADMIN_TOKEN definido na Vercel (Settings → Environment Variables), não o do server/.env local.";
  }
  if (import.meta.env.DEV) {
    return " Verifique se o backend está rodando (na raiz: npm run dev — API em :3001). Abra o app em http://localhost:5173";
  }
  return " Verifique se a API está no ar. No mesmo domínio da Vercel, VITE_API_BASE pode ficar vazio.";
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
    throw new Error(`${messageFromErrorBody(t, r.status)}${apiHint(r.status)}`);
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
    throw new Error(`${messageFromErrorBody(t, r.status)}${apiHint(r.status)}`);
  }
  const ct = r.headers.get("content-type");
  if (ct?.includes("application/json")) return r.json() as Promise<T>;
  return undefined as T;
}

function filenameFromDisposition(disposition: string | null, fallback: string) {
  const match = disposition?.match(/filename="?(?<name>[^";]+)"?/i);
  return match?.groups?.name ?? fallback;
}

export async function downloadFile(path: string, token: string, fallbackName: string) {
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
    throw new Error(`${messageFromErrorBody(t, r.status)}${apiHint(r.status)}`);
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filenameFromDisposition(r.headers.get("content-disposition"), fallbackName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
