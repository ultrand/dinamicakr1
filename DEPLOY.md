# Colocar na internet

O app precisa de **PostgreSQL** (não use SQLite em produção) e de um processo Node acessível publicamente.

## Opção A — Um único endereço (recomendado)

**Docker** entrega API + frontend na **mesma URL** (sem configurar `VITE_API_BASE`).

### 1. Banco PostgreSQL gerenciado

Crie um banco em um destes (grátis com limites):

- [Neon](https://neon.tech)  
- [Supabase](https://supabase.com) (Postgres)  
- [Railway](https://railway.app) / [Render](https://render.com) (addon Postgres)

Copie a **connection string** `postgresql://...` (em Neon costuma incluir `?sslmode=require`).

### 2. Hospedar o container

**Railway / Render / Fly.io / VPS**

1. Conecte o repositório Git ou faça deploy da imagem buildada a partir do `Dockerfile` na raiz.
2. Variáveis de ambiente:
   - `DATABASE_URL` — URL do Postgres (obrigatório)
   - `DIRECT_URL` — mesma URL que `DATABASE_URL` em Postgres “normal”; no Supabase + Prisma ver `VERCEL-SOLO.md`
   - `ADMIN_TOKEN` — senha forte do `/admin` (obrigatório)
   - `PORT` — muitas plataformas injetam automaticamente; deixe vazio ou use o valor que a plataforma indicar
   - `PUBLIC_URL` — URL pública do site (ex.: `https://seu-app.onrender.com`), só para log
   - `CORS_ORIGINS` — se no futuro o front estiver noutro domínio, liste as origens separadas por vírgula; no deploy **único** com Docker pode usar `*`

3. Comando de start (se a plataforma não usar o `CMD` do Dockerfile):

   ```bash
   npm run start:seed --workspace=server
   ```

   Na primeira subida isso aplica migrações, executa o seed (tarefas + perguntas) e sobe o servidor.

4. Abra a URL pública: rota `/` = participante, `/admin` = administração.

### 3. Saúde

`GET /api/health` deve responder `{"ok":true,...}`.

---

## Opção B — Front na Vercel + API noutro host

1. Faça deploy da **API** como na opção A (só precisa do backend; pode usar o mesmo `Dockerfile` ou `npm run start:seed` no servidor Node).
2. Na **Vercel**, no projeto do `client`, defina:
   - `VITE_API_BASE` = URL da API (ex.: `https://api.seudominio.com`), **sem** barra no fim
3. No servidor Express, defina `CORS_ORIGINS` com a origem do front (ex.: `https://seu-projeto.vercel.app`).

---

## Desenvolvimento local com Postgres

```bash
docker compose up -d db
```

Copie `server/.env.example` para `server/.env`, ajuste `DATABASE_URL` para `localhost`.

```bash
npm install
npm run db:deploy --workspace=server
npm run db:seed --workspace=server
npm run dev
```

Ou tudo de uma vez com UI em `http://localhost:3001`:

```bash
docker compose up --build
```

---

## Segurança

- Troque `ADMIN_TOKEN` por um valor longo e aleatório.  
- Em produção, prefira HTTPS (a plataforma costuma terminar TLS).  
- Não commite `.env` com segredos reais.
