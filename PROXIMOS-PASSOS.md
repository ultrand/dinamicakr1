# Próximos passos (ordem sugerida)

Siga na ordem. O que o Cursor **já deixou pronto** no código: `vercel.json`, `api/index.ts`, `scripts/vercel-build.mjs`, build do client/server.

---

## 1. Supabase (banco)

1. Acesse [supabase.com](https://supabase.com) e abra seu projeto (ou crie um).
2. **Project Settings → Database**
3. Copie a **Connection string** no formato **URI** (começa com `postgresql://`).
4. Para deploy serverless, use o **Transaction pooler** se aparecer (porta **6543**), ou a URI que o próprio Supabase indicar para “serverless”.

Guarde essa string — é o valor de `DATABASE_URL`.

---

## 2. Repositório Git + GitHub

1. No PC, na pasta do projeto:
   ```bash
   git init
   git add .
   git commit -m "Deploy: Vercel + Supabase"
   ```
2. No GitHub: **New repository** (pode ser privado).
3. Siga as instruções do GitHub para **enviar o código** (`git remote add` + `git push`).

> Se o projeto já tiver `git` e `remote`, só faça `git push`.

---

## 3. Vercel

1. Acesse [vercel.com](https://vercel.com) → **Add New → Project**.
2. **Import** o repositório do GitHub.
3. Deixe as opções padrão — o `vercel.json` já define build e pasta de saída.
4. Em **Environment Variables**, adicione (para **Production** e, se quiser, **Preview**):

| Nome | Valor |
|------|--------|
| `DATABASE_URL` | A URI do Supabase (passo 1) |
| `ADMIN_TOKEN` | Uma senha longa e secreta (acesso `/admin`) |
| `CORS_ORIGINS` | `*` no começo, ou depois `https://SEU-PROJETO.vercel.app` |

5. **Deploy**.

---

## 4. Testar

Abra no navegador (troque pelo seu domínio):

- `https://SEU-PROJETO.vercel.app/api/health` → deve mostrar JSON com `"ok": true`
- `https://SEU-PROJETO.vercel.app/` → tela do participante
- `https://SEU-PROJETO.vercel.app/admin` → admin (use o `ADMIN_TOKEN`)

---

## 5. Popular tarefas (opcional, uma vez)

Com o `DATABASE_URL` no ambiente local (`server/.env`):

```bash
npm run db:seed --workspace=server
```

(Se pedir `SYNC_DRAFT_TASKS` para substituir cards, veja o `README` / `DEPLOY.md`.)

---

## 6. Se algo falhar

| Sintoma | O que checar |
|---------|----------------|
| Build falha na Vercel | Logs do build: `DATABASE_URL` está nas env vars? |
| `/api/health` 500 | Logs da função **Serverless** na Vercel; conferir `DATABASE_URL` e se o Supabase aceita conexões. |
| Página em branco | Console do navegador (F12); rota errada ou JS bloqueado. |
| CORS | Ajuste `CORS_ORIGINS` para a URL exata do site. |

Mais detalhes: **`VERCEL-SOLO.md`**.
