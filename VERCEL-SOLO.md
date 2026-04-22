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
2. Abra **Connect** (ou **Project Settings → Database**).
3. O Prisma na Vercel precisa de **duas** strings (igual à [documentação Supabase + Prisma](https://supabase.com/docs/guides/database/prisma)):
   - **`DIRECT_URL`** — aba **Session pooler**, tipo **URI**, porta **5432**, host que termina em **`pooler.supabase.com`**. Serve para **`prisma migrate deploy`** no build (IPv4-friendly; não use só o host `db…supabase.co` se a Vercel não conseguir IPv6).
   - **`DATABASE_URL`** — para a API em serverless, use o **Transaction pooler**, porta **6543**, e no fim da string acrescente **`?pgbouncer=true`** (o painel do Supabase costuma mostrar isso).
4. No utilizador da URI do **pooler**, o Supabase usa o formato **`postgres.SEU_PROJECT_REF`** (ex.: `postgres.abcxyz`) — copie do painel; não inventes o prefixo.
5. Se a palavra-passe tiver **`#`**, **`@`**, **`:`**, etc., tem de ir **codificada** na URI (ex.: `#` → `%23`), ou muda a palavra-passe para uma sem esses símbolos.

### 2) Vercel

1. **Import project** → o repositório Git deste app.
2. **Root Directory:** deixe **vazio** ou **`.`** (raiz do repo). **Não** use `server` — o build quebra.
3. A Vercel usa o `vercel.json` (build do client + função em `api/index.ts`).
4. Em **Settings → Environment Variables**, adicione pelo menos:

| Nome | Valor |
|------|--------|
| `DATABASE_URL` | **Transaction pooler** (6543) + `?pgbouncer=true` — conexões curtas na função serverless. |
| `DIRECT_URL` | **Session pooler** (5432, host `…pooler.supabase.com`) — obrigatória para o build aplicar migrações. |
| `ADMIN_TOKEN` | Uma senha forte (acesso ao `/admin`) |
| `CORS_ORIGINS` | Pode deixar `*` no começo, ou colocar depois a URL do site, ex. `https://seu-app.vercel.app` |

**Mínimo viável (só para testar):** podes colar a **mesma** URI do Session pooler em **`DATABASE_URL`** e em **`DIRECT_URL`** (menos ideal para muito tráfego, mas costuma funcionar).

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

- **Log `[vercel-build] Falta a variável DIRECT_URL`:** cria **`DIRECT_URL`** na Vercel com a URI do **Session pooler** (5432) do Supabase.
- **Build parando em `prisma migrate deploy`:** confirma **`DIRECT_URL`** = Session pooler; **`DATABASE_URL`** em serverless = Transaction (6543) + `?pgbouncer=true`, ou as duas iguais ao Session para testar.
- **Erro no build com Prisma:** confirma **`DATABASE_URL`** e **`DIRECT_URL`** em **Production** (e Preview, se usar).
- **Log com commit antigo:** no GitHub confira se o `main` está atualizado e na Vercel faça **Redeploy** do último commit.
- **502 nas rotas /api:** veja os logs da função na Vercel.

---

## Resumo

Você usa **só as contas que já quis** (Vercel + Supabase). O código foi ajustado para a API rodar **na própria Vercel** (`api/index.ts`), sem segundo serviço de hospedagem.
