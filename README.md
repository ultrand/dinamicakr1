# Dinâmica KR — MVP (tarefas críticas + fluxos)

Aplicativo web para dinâmica de equipe: seleção de tarefas críticas (“cabeças”), reflexões escritas e montagem de fluxos com **reuso de cards** e **análise agregada** (sem inspeção resposta a resposta).

## Stack

- **Frontend:** React, TypeScript, Vite, `@dnd-kit` (drag-and-drop com slots)
- **Backend:** Node.js, Express
- **Dados:** PostgreSQL + Prisma

## Pré-requisitos

- Node.js 20+ (recomendado)
- PostgreSQL local (ex.: `docker compose up -d db` na raiz — ver `docker-compose.yml`)

## Um comando (desenvolvimento)

Na raiz do projeto:

```bash
docker compose up -d db
cp server/.env.example server/.env   # ajuste DATABASE_URL se necessário
npm install
npm run db:deploy --workspace=server
npm run db:seed --workspace=server
npm run dev
```

Isso sobe:

- API em `http://localhost:3001`
- Interface em `http://localhost:5173` (proxy de `/api` para a API)

Abra **`http://localhost:5173`**.

### Produção local (API + SPA no mesmo servidor)

```bash
docker compose up --build
```

Ou, sem Docker no app (só Postgres em Docker): `npm run build` na raiz e `npm run start:seed --workspace=server` com `DATABASE_URL` apontando para o Postgres.

Abra `http://localhost:3001` (o Express serve o build do Vite se `client/dist` existir).

## Deploy na internet

Veja **[DEPLOY.md](./DEPLOY.md)** (Docker, Neon/Railway/Render, Vercel + API).

## Admin

- Rota: `/admin`
- Autenticação: variável **`ADMIN_TOKEN`** no `server/.env` (padrão de desenvolvimento: `dev-admin-token-change-me`)

Abas:

1. **Perguntas** — ordem arrastando; editar título/ajuda; tipos fixos; obrigatória.
2. **Cards** — busca, edição, cola em massa (uma linha por tarefa: primeira palavra = verbo, resto = texto principal), arquivar.
3. **Versões** — tudo permanece em **rascunho** até **Publicar versão** (snapshot imutável para novas respostas).

## Participante (`/`)

Fluxo: seleção de críticas → pergunta “mais difícil / por quê” → texto longo sobre dificuldades → **fluxo por crítica** com banco de cards e trilha numerada até **CHEGAR EM: [crítica]**.

## Análise (`/admin/analise`)

Por versão publicada: rankings, caminho mais comum por crítica, grafo agregado A→B (espessura = frequência), filtro por crítica para métricas de fluxo.

## Export (`/admin/export`)

- **CSV** por passo: `response_id`, `critical_task_id`, `step_index`, `task_id`
- **JSON** por resposta: crítica → sequência de `task_id`

O download aceita o token na query string (útil no navegador).

## Variáveis de ambiente (`server/.env`)

| Variável        | Descrição                                      |
|-----------------|------------------------------------------------|
| `DATABASE_URL`  | URL `postgresql://...` (local: ver `docker-compose.yml`) |
| `ADMIN_TOKEN`   | Token do painel admin                          |
| `PORT`          | Porta da API (padrão `3001`)                   |
| `CORS_ORIGINS`  | Origens permitidas (opcional; ver `DEPLOY.md`) |
| `PUBLIC_URL`    | URL pública (opcional, logs)                   |

## Seed

O arquivo `server/prisma/seed-tasks.txt` lista tarefas iniciais (uma por linha). O seed extrai **verbo = primeira palavra** e **texto principal = restante**, cria perguntas padrão e **publica a primeira versão** automaticamente.

## Modelo de dados (resumo)

PostgreSQL via Prisma: `Study`, `StudyVersion` (rascunho único + versões publicadas), `Task` (cards por versão), `Question`, `Response`, `CriticalSelection`, `CriticalDifficulty`, `ConceptualDifficulty`, `Path`, `PathStep`.

Respostas **nunca são reescritas**; cards com uso em resposta só podem ser **inativados**, não removidos.
