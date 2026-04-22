# Próximos passos (ordem sugerida)

Siga na ordem. Leia **`VERCEL-SOLO.md`** para o guia detalhado passo a passo.

---

## 1. Supabase (banco de dados)

1. Acesse [supabase.com](https://supabase.com) e abra (ou crie) o seu projeto.
2. Clique em **Connect** → **Session pooler** → tipo **URI** → copie a string `postgresql://...` (porta **5432**).
3. Guarde essa URL — é o único valor que precisas.

---

## 2. Repositório Git + GitHub

```bash
git add .
git commit -m "Deploy: Vercel + Supabase"
git push
```

> Se o projeto ainda não tiver repositório GitHub, cria um em [github.com](https://github.com) e faz `git remote add origin URL && git push -u origin main`.

---

## 3. Cria as tabelas na base de dados (uma só vez, do teu PC)

```powershell
$env:DATABASE_URL="COLA_AQUI_A_URI_DO_SUPABASE"; npm run db:setup
```

✅ Quando aparecer que as migrações foram aplicadas, as tabelas estão criadas.

---

## 4. Vercel

1. Acesse [vercel.com](https://vercel.com) → **Add New → Project** → importa o repositório.
2. **Root Directory:** deixa **vazio**.
3. Em **Environment Variables**, adiciona:

| Nome | Valor |
|------|--------|
| `DATABASE_URL` | A URI do Supabase (Session pooler, porta 5432) |
| `ADMIN_TOKEN` | Uma senha secreta longa |
| `CORS_ORIGINS` | `*` |

4. Clica **Deploy**.

---

## 5. Testa

- `https://SEU-PROJETO.vercel.app/api/health` → deve mostrar `{"ok":true,...}`
- `https://SEU-PROJETO.vercel.app/` → ecrã do participante
- `https://SEU-PROJETO.vercel.app/admin` → admin (usa o `ADMIN_TOKEN`)

---

## 6. Popular tarefas (opcional)

```powershell
$env:DATABASE_URL="COLA_AQUI_A_URI_DO_SUPABASE"; npm run db:seed
```

---

## 7. Se algo falhar

| Sintoma | O que fazer |
|---------|-------------|
| Build falha na Vercel | Vê o log completo e partilha aqui |
| `/api/health` retorna 500 | Logs da função em **Vercel → Deployments → Functions** |
| Página em branco | Abre o console do navegador (F12) |

Guia completo: **`VERCEL-SOLO.md`**.
