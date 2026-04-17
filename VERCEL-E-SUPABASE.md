# Guia simples: Vercel + Supabase (o que falta e onde clicar)

## Responde rápido

| Pergunta | Resposta |
|----------|----------|
| **Precisa de banco SQL?** | **Sim.** O app guarda tarefas, respostas, versões. Sem banco não tem onde salvar. |
| **O Supabase resolve?** | **Sim.** O Supabase **é** um PostgreSQL na nuvem. Você só copia a **URL de conexão**. |
| **Só o Vercel basta?** | **Quase.** No Vercel fica o **site** (telas). A **API** (o programa que fala com o banco) precisa rodar em **outro serviço grátis** — o mais fácil é o **Railway** ou **Render**, usando o `Dockerfile` que já existe neste projeto. |
| **O que você já tem** | Conta Vercel + Supabase = ótimo. |
| **O que ainda falta** | 1) Criar o banco no Supabase e copiar a URL. 2) Subir a **API** num lugar (Railway/Render). 3) No Vercel, colar a URL da API em uma variável. |

---

## Parte 1 — Supabase (banco de dados)

1. Entre no [Supabase](https://supabase.com) e crie um **projeto** (escolha região perto de você).
2. Espere terminar de criar.
3. Vá em **Project Settings** → **Database**.
4. Em **Connection string**, escolha **URI** e copie a URL. Ela parece com:
   `postgresql://postgres.[ref]:[SENHA]@aws-0-...pooler.supabase.com:6543/postgres`
5. **Guarde essa URL** — você vai colar no Railway/Render como `DATABASE_URL` (é segredo, não compartilhe em público).

> **Senha:** se não souber, em **Database** tem opção de resetar a senha do banco.

---

## Parte 2 — Onde roda a “API” (Railway, exemplo)

O Vercel **não** fica com o servidor Node deste projeto rodendo o tempo todo como um PC ligado. Por isso a API vai para o **Railway** (ou Render):

1. Entre no [Railway](https://railway.app) e faça login com GitHub.
2. **New project** → **Deploy from GitHub repo** → escolha **este repositório**.
3. O Railway detecta o **Dockerfile** na raiz.
4. Em **Variables**, adicione:
   - `DATABASE_URL` = a URL que você copiou do Supabase (a mesma do passo 1).
   - `ADMIN_TOKEN` = uma **senha longa** que só você sabe (é o “login” do `/admin`).
   - `CORS_ORIGINS` = a URL do seu site no Vercel, ex.: `https://seu-projeto.vercel.app`  
     (se não souber ainda, pode pôr `*` no começo e depois trocar pela URL certa.)
5. **Deploy.** Quando terminar, o Railway mostra uma URL pública tipo `https://seu-app.up.railway.app`.
6. Teste no navegador: `https://SUA-URL-RAILWAY.up.railway.app/api/health`  
   Se aparecer JSON com `"ok": true`, a API está no ar.

---

## Parte 3 — Vercel (só o site)

1. No [Vercel](https://vercel.com), **Add New** → **Project** → importe **o mesmo repositório**.
2. O arquivo `vercel.json` já diz como buildar o **client**.
3. Em **Environment Variables**, adicione:
   - **Nome:** `VITE_API_BASE`  
   - **Valor:** a URL **da API** (a do Railway), **sem** barra no final, ex.: `https://seu-app.up.railway.app`
4. **Deploy.**

Depois disso, o site no Vercel chama a API no Railway, e a API usa o banco no Supabase.

---

## Checklist final

- [ ] Supabase com projeto criado e `DATABASE_URL` copiada  
- [ ] Railway (ou Render) com o repo, `DATABASE_URL`, `ADMIN_TOKEN`, `CORS_ORIGINS`  
- [ ] `/api/health` da API abrindo no navegador  
- [ ] Vercel com `VITE_API_BASE` = URL da API  
- [ ] Abrir o link `.vercel.app` e testar o participante; abrir `/admin` com o token que você definiu em `ADMIN_TOKEN`  

---

## Se algo der errado

- **Tela branca ou erro de rede:** `VITE_API_BASE` errado ou API caída. Confira a URL no Vercel (sem `/` no fim).  
- **CORS:** coloque em `CORS_ORIGINS` exatamente a URL do site Vercel (`https://algo.vercel.app`).  
- **Banco:** confira se a senha na URL do Supabase está certa (caracteres especiais às vezes precisam ser “encode” na URL).

---

## Resumo em uma frase

**Supabase = onde os dados ficam guardados.**  
**Railway (ou parecido) = onde o programa que conversa com o banco fica ligado.**  
**Vercel = onde o site que as pessoas veem fica.**  

Os três juntos = qualquer pessoa acessa pelo link do Vercel.
