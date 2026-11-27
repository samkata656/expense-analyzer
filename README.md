# TechCorp · Разходи: Intelligent Expense Analyzer

A proof of concept that lets employees photograph a receipt, or describe an expense, and get an instant decision based on company policy. **n8n** reads the receipt with GPT-6 Luna (vision) and applies the 8 company policies with plain If/Switch/Set nodes (no Code node, no AI decision). It stores everything in **Postgres + pgvector**. A CFO-only AI assistant answers questions about the spending.

Built for the EAIA exam (29.11.2025) and self-hosted on a DigitalOcean droplet through Portainer instead of Supabase/Vercel.

## Architecture

```
Browser ──HTTPS──▶ Nginx Proxy Manager ──▶ web (Next.js 16, Node 26) ──internal──▶ n8n 2.49 ──▶ OpenAI (GPT-6 Luna)
                                             │  uploads volume               │
                                             └──────────── Postgres 18 + pgvector ◀──┘
```

| Part | What it does |
|---|---|
| `apps/web` | Mobile-first UI in Bulgarian: identity (name + employee ID), receipt or camera upload, comment, history with totals by category and status, and the `/cfo` chat. The API routes validate input, check file types by magic bytes, store images and forward requests to n8n with a shared secret. |
| `n8n/workflows` | **Expense Intake**: checks the employee, runs the jailbreak guard, reads the receipt with vision, calls *Expense Policy*, saves the result and creates an embedding. **Expense Policy**: rules P1–P8. **Error Handler**: writes to `error_logs`. **CFO Assistant**: AI agent with read-only SQL, semantic search and memory. |
| `db` | Postgres image with roles `app_rw`, `cfo_readonly` (SELECT only, no employee codes) and `n8n`. Migrations and seed data are in `db/migrations`. |

Docs: [n8n change log](n8n/CHANGELOG.md) · [all prompts](n8n/PROMPTS.md) · [prompts used to generate the schema and UI](docs/prompts/db.md) · [deployment guide](docs/DEPLOY.md)

## Company policies (enforced in n8n, amounts in BGN; EUR × 1.95583)
1. Food: alcohol → rejected; ≤ 50 лв → approved; more → manual review
2. Business meal: ≤ 400 лв → approved (alcohol allowed); more → manual review
3. Cigarettes → rejected
4. City transport / taxi: ≤ 30 лв → approved; more → rejected
5. Travel outside the city → manual review
6. IT equipment: ≤ 600 лв → approved; more → rejected
7. Courses and training → approved
8. Everything else → manual review

Any other currency, an unreadable receipt or a suspicious comment sends the expense to manual review or returns a clear error.

## Run locally

Requirements: Docker, Node 26.

```bash
cp .env.example .env            # dev defaults work as-is
docker compose -f docker-compose.dev.yml up -d --build   # Postgres :55432, n8n :5678
cd apps/web && cp .env.example .env.local && npm ci && npm run dev   # http://localhost:3000
```

Open n8n at http://localhost:5678, create the owner account and paste your OpenAI key into the **OpenAI** credential. The workflows and other credentials are imported automatically.

Demo employees (seed data): `Иван Петров / EMP-001`, `Мария Георгиева / 1042`, `Елена Николова / en77`, and the CFO is `Росица Ангелова / CFO-7781`. In production the CFO's code is replaced by the secret `CFO_EMPLOYEE_CODE`.

## Tests

| Suite | Command (from `apps/web`) | Covers |
|---|---|---|
| Unit + API integration | `npm test` | validation, file sniffing, history totals, every API route against a real throwaway Postgres DB with n8n stubbed, DB role permissions |
| n8n policy rules | `node --test tests/policy.test.mjs` (repo root) | 30 boundary cases through the real *Expense Policy* workflow |
| E2E | `npm run e2e` | Playwright on desktop and Pixel 7: identity, submission, history, errors, CFO chat |

GitHub Actions runs all of them on every PR, plus Docker builds. A merge to `main` publishes `ghcr.io/samkata656/expense-analyzer-{web,db,n8n}`. Codex reviews PRs using the guidelines in [AGENTS.md](AGENTS.md).

## Security notes and known limits
- As the spec requires, identity is **name + employee ID** with no password, so anyone who knows an employee's ID can act as that employee. The CFO's code is a production secret, and the CFO assistant can't read employee codes.
- n8n webhooks need the `X-Webhook-Secret` header, and the web app reaches n8n over the internal Docker network only.
- User comments are treated as data: they're wrapped in markers, a guard model checks them, injected instructions are stripped and logged to `jailbreak_attempts`, and the expense goes to manual review. Text hidden inside an image can still influence extraction, but the decision itself is never made by the model.
- Receipt images are served at unguessable UUID URLs without authentication.
- The rate limiting is in memory and per IP. Set a monthly budget on the OpenAI project.

---
built by [samkoBuilds](https://samkobuilds.com)
