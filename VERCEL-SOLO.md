# Só Vercel + Supabase (sem Railway, sem Docker Hub)

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
2. A Vercel usa o `vercel.json` (build do client + função em `api/index.ts`).
3. Em **Settings → Environment Variables**, adicione pelo menos:

| Nome | Valor |
|------|--------|
| `DATABASE_URL` | A URI do Postgres do Supabase |
| `ADMIN_TOKEN` | Uma senha forte (acesso ao `/admin`) |
| `CORS_ORIGINS` | Pode deixar `*` no começo, ou colocar depois a URL do site, ex. `https://seu-app.vercel.app` |

4. **Deploy**.

5. Depois do primeiro deploy, abra no navegador:
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

- **Erro no build com Prisma:** confira se `DATABASE_URL` está nas variáveis de ambiente da Vercel (Production e Preview, se usar preview).
- **Erro de migração:** a URL precisa permitir criar tabelas (usuário `postgres` com permissão).
- **502 nas rotas /api:** veja os logs da função na Vercel; às vezes falta `binaryTargets` do Prisma (já está no `schema.prisma`).

---

## Resumo

Você usa **só as contas que já quis** (Vercel + Supabase). O código foi ajustado para a API rodar **na própria Vercel** (`api/index.ts`), sem segundo serviço de hospedagem.
