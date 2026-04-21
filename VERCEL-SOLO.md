# Só Vercel + Supabase (sem Railway, sem Docker Hub)

**Checklist na ordem:** abra também **`PROXIMOS-PASSOS.md`** (GitHub + variáveis + testes).

## O que você precisa ter conta

| Serviço | Para quê |
|---------|----------|
| **Vercel** | O site + a API (tudo no mesmo domínio `.vercel.app`) |
| **Supabase** | O banco de dados (PostgreSQL) |

**Não** precisa criar conta em **Docker** nem em **Railway/Render** — Docker aqui é só arquivo no projeto; a Vercel usa isso por baixo dos panos quando faz o deploy.

---

## Passo a passo (bem curto)

### 1) Supabase

1. Crie um projeto.
2. Em **Project Settings → Database**, copie a **connection string** (URI).
3. Para servidor “serverless” (Vercel), prefira o **Transaction pooler** (porta **6543**), se o Supabase oferecer — ajuda com muitas conexões curtas.
4. Cole essa URL na Vercel como `DATABASE_URL` (próximo passo).

### 2) Vercel

1. **Import project** → o repositório Git deste app.
2. **Root Directory:** deixe **vazio** ou **`.`** (raiz do repo). **Não** use `server` — o build quebra.
3. A Vercel usa o `vercel.json` (build do client + função em `api/index.ts`).
4. Em **Settings → Environment Variables**, adicione pelo menos:

| Nome | Valor |
|------|--------|
| `DATABASE_URL` | No Supabase: URI com **connection pooling** (ex. porta **6543**), se o painel oferecer — melhor para a API serverless. |
| `DIRECT_DATABASE_URL` | No Supabase: URI **Session** ou **Direct** (porta **5432**) — o Prisma usa isso só para **`migrate deploy`** no build. Sem isso, o build costuma falhar no passo das migrações. |
| `ADMIN_TOKEN` | Uma senha forte (acesso ao `/admin`) |
| `CORS_ORIGINS` | Pode deixar `*` no começo, ou colocar depois a URL do site, ex. `https://seu-app.vercel.app` |

No **Supabase** → **Project Settings → Database** existem várias strings; copie uma para “pooler/transaction” (`DATABASE_URL`) e outra **direta** (`DIRECT_DATABASE_URL`). Se só tiver uma, pode repetir a mesma nas duas variáveis (menos ideal em produção, mas funciona).

5. **Deploy**.

6. Depois do primeiro deploy, abra no navegador:
   - `https://SEU-PROJETO.vercel.app/api/health` → deve aparecer JSON com `"ok": true`.
   - `https://SEU-PROJETO.vercel.app/` → participante.
   - `/admin` → painel (com o token que você definiu).

### 3) Popular tarefas (seed) — uma vez

O build já roda `prisma migrate deploy`. Para carregar as tarefas iniciais, você pode:

- Rodar localmente com `DATABASE_URL` apontando para o Supabase:  
  `npm run db:seed --workspace=server`  
  **ou**
- Adicionar um comando/script depois no painel (opcional).

---

## Variável `VITE_API_BASE`

**Não precisa** configurar se o site e a API estão **no mesmo domínio** da Vercel (é o caso deste guia). O app chama `/api/...` no mesmo endereço.

Só usaria `VITE_API_BASE` se um dia o front estivesse num domínio e a API em outro.

---

## Se o deploy falhar

- **Build parando em `prisma migrate deploy`:** crie na Vercel a variável **`DIRECT_DATABASE_URL`** com a URI **Direct** do Supabase (porta **5432**). Migrações não funcionam bem só com o **pooler** (6543).
- **Erro no build com Prisma:** confira `DATABASE_URL` e `DIRECT_DATABASE_URL` em **Production** (e Preview, se usar).
- **Log com commit antigo:** no GitHub confira se o `main` está atualizado e na Vercel faça **Redeploy** do último commit.
- **502 nas rotas /api:** veja os logs da função na Vercel.

---

## Resumo

Você usa **só as contas que já quis** (Vercel + Supabase). O código foi ajustado para a API rodar **na própria Vercel** (`api/index.ts`), sem segundo serviço de hospedagem.
