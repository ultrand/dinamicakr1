# Deploy: Vercel + Supabase

Precisas de conta em **Vercel** (o site + API) e **Supabase** (base de dados). Só isso.

---

## Passo 1 — Supabase: copia a URL da base de dados

1. Entra no teu projeto em [supabase.com](https://supabase.com).
2. Clica em **Connect** (botão no topo).
3. Escolhe **Session pooler** → tipo **URI**.
4. Copia a string que começa por `postgresql://...` (porta **5432**).
5. **Guarda-a** — vais usá-la no Passo 2 e no Passo 3.

> Se a tua senha tiver `#`, `@` ou outros símbolos especiais, vai ao Supabase, muda a senha da base de dados para uma com só **letras e números**, e copia a URI de novo.

---

## Passo 2 — Aplica as tabelas na base de dados (uma vez, do teu PC)

Abre o terminal **dentro da pasta do projeto** e corre:

```powershell
$env:DATABASE_URL="COLA_AQUI_A_URI_DO_SUPABASE"; npm run db:setup
```

Substitui `COLA_AQUI_A_URI_DO_SUPABASE` pela URI copiada no Passo 1 (mantém as aspas).

✅ Quando aparecer `All migrations have been successfully applied` (ou similar), as tabelas foram criadas. **Só precisas de fazer isto uma vez.**

---

## Passo 3 — Vercel: liga o repositório e define as variáveis

1. Em [vercel.com](https://vercel.com) → **Add New → Project** → importa o repositório do GitHub.
2. **Root Directory:** deixa **vazio** (não escrevas `server`).
3. Clica em **Deploy** — vai falhar na primeira vez se não tiveres as variáveis. Isso é normal.
4. Vai a **Settings → Environment Variables** e adiciona:

| Nome | Valor |
|------|--------|
| `DATABASE_URL` | A mesma URI do Supabase que usaste no Passo 1 |
| `ADMIN_TOKEN` | Uma senha longa qualquer (ex: `minha-senha-secreta-2026`) |
| `CORS_ORIGINS` | `*` |

5. Vai a **Deployments** → clica no último deploy → **Redeploy**.

✅ Quando aparecer ✓ no deploy, o site está no ar.

---

## Passo 4 — Testa

- `https://SEU-PROJETO.vercel.app/api/health` → deve aparecer `{"ok":true,...}`
- `https://SEU-PROJETO.vercel.app/` → ecrã do participante
- `https://SEU-PROJETO.vercel.app/admin` → painel (pede o `ADMIN_TOKEN`)

---

## Carregar tarefas iniciais (seed) — opcional

Para preencher a base de dados com as tarefas do ficheiro `server/prisma/seed-tasks.txt`, corre no terminal do teu PC:

```powershell
$env:DATABASE_URL="COLA_AQUI_A_URI_DO_SUPABASE"; npm run db:seed
```

---

## Se o deploy falhar

| Erro no log | O que fazer |
|-------------|-------------|
| `prisma generate` falhou | Verifica se o repositório está actualizado no GitHub (`git push`) |
| `vite build` falhou | Erro de código — partilha o log completo |
| `502` nas rotas `/api` | Vai a **Vercel → Deployments → Functions → Logs** e partilha o erro |
| Base de dados sem tabelas | Corre de novo o comando do Passo 2 |
