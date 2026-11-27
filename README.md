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
docker compose -f docker-compose.dev.yml up -d --build   # Postgres :55432, n8n :5678 (built-in dev defaults)
cd apps/web && cp .env.example .env.local && npm ci && npm run dev   # http://localhost:3000
```

`apps/web/.env.example` matches the dev compose defaults. The root `.env.example` is the **production** variable list for Portainer, so don't use it locally.

Open n8n at http://localhost:5678, create the owner account and paste your OpenAI key into the **OpenAI** credential. The workflows and other credentials are imported automatically.

Demo employees (seed data): `Иван Петров / EMP-001`, `Мария Георгиева / 1042`, `Елена Николова / en77`, and the CFO is `Росица Ангелова / CFO-7781`. In production the CFO's code is replaced by the secret `CFO_EMPLOYEE_CODE`.

## Tests

| Suite | Command (from `apps/web`) | Covers |
|---|---|---|
| Unit + API integration | `npm test` | validation, file sniffing, history totals, every API route against a real throwaway Postgres DB with n8n stubbed, DB role permissions |
| n8n policy rules | `node --test tests/policy.test.mjs` (repo root) | 30 boundary cases through the real *Expense Policy* workflow |
| E2E | `npm run e2e` | Playwright on desktop and Pixel 7: identity, submission, history, errors, CFO chat |

GitHub Actions runs all of them on every PR, plus Docker builds. A merge to `main` publishes `ghcr.io/samkata656/expense-analyzer-{web,db,n8n}:latest`, and a GitHub Release `vX.Y.Z` publishes `:X.Y.Z`, which is what production pins (`IMAGE_TAG`). See [DEPLOY.md → Updating](docs/DEPLOY.md#updating-releases). Codex reviews PRs using the guidelines in [AGENTS.md](AGENTS.md).

## Security audit

Two audits were run before going live, using the `code-review` and `cso` skills: one on the repository before it was published, and one on the running droplet after deployment.

### 1. Repository (`/code-review` + `/cso --comprehensive`, before publishing)
| Finding | Severity | Outcome |
|---|---|---|
| The public seed contains the CFO's name and code, so anyone could open `/cfo` | High | **Fixed.** `CFO_EMPLOYEE_CODE` (required in production) replaces the demo code at startup. |
| The CFO agent could read employee codes (the login secret) through SQL or embeddings | Medium | **Fixed.** `cfo_readonly` has a column-level grant without `employee_code`, codes were removed from the embeddings, and prompt `cfo-v1.1` refuses to reveal them (migration `003`). |
| Unpinned `nginx-proxy-manager:latest` | Medium | **Fixed.** Pinned to `2.17.1`. |
| First-visit takeover of the n8n/NPM admin accounts during deploy | Medium | **Mitigated.** The firewall comes first in the deploy guide, and the owners are created before the hosts go public. |
| OpenAI spend abuse through IP rotation | Medium | **Mitigated.** Per-IP rate limit plus a hard monthly limit on the OpenAI project. |
| n8n webhooks reachable on the public n8n host | Low | **Fixed.** The n8n host is IP-allow-listed in NPM, and the web app calls n8n over the internal network only. |
| Code review: oversized uploads buffered, image deleted on an n8n timeout, `PUBLIC` could connect to the n8n/postgres DBs | Medium | **Fixed** (body-size guard, image kept on timeout, `REVOKE CONNECT`), with regression tests. |
| Codex PR review: wrong `sha-` tag in publish, mismatched local `.env` docs, budget without a hard limit | Medium | **Fixed** (#5). |

Clean: no secrets in git history, `npm audit` reports 0 vulnerabilities, all SQL is parameterised, no raw HTML from AI output, containers run without root, and the actions are SHA-pinned with minimal permissions.

### 2. Droplet (`/cso --infra --comprehensive`, run by Claude Code over SSH on the server)
| Finding | Severity | Outcome |
|---|---|---|
| The 6 demo employee codes are public (seed file) | High | **Accepted for the exam demo.** They exist so examiners can log in. The DB holds no real data, and spend is capped by the OpenAI hard limit. Before real use, replace them with real employees and private codes. |
| NPM admin (:81) and Portainer (:9443) bound to `0.0.0.0`, and Docker bypasses ufw | High | **Fixed.** The DigitalOcean Cloud Firewall has no rule for 81 (verified to time out from outside), and 9443 is open to the owner's IP only. Port 81 is now also bound to `127.0.0.1` and reached through an SSH tunnel. |
| The `app_rw` password is visible in the container env and was printed in the audit transcript | Medium | **Accepted.** Postgres isn't published, and the transcript is local to the server. The safe rotation procedure is in [DEPLOY.md](docs/DEPLOY.md#troubleshooting). |
| Kernel updates installed, reboot pending | Medium | **Resolved by** a reboot ([DEPLOY.md](docs/DEPLOY.md) step 10). The containers restart by themselves. |
| Production pulled `:latest` | Low | **Resolved by** pinning `IMAGE_TAG=sha-…` in the stack ([DEPLOY.md](docs/DEPLOY.md) step 6), so you can roll back by tag. |
| `deploy` has NOPASSWD sudo and docker access, and X11 forwarding is on | Low | **Accepted.** This is the standard course cloud-init. Key-only SSH, root login disabled, fail2ban and unattended-upgrades are active. |

## Security notes and known limits
- As the spec requires, identity is **name + employee ID** with no password, so anyone who knows an employee's ID can act as that employee. The CFO's code is a production secret, and the CFO assistant can't read employee codes.
- n8n webhooks need the `X-Webhook-Secret` header, and the web app reaches n8n over the internal Docker network only. The n8n editor is reachable only from the owner's IP (NPM access list).
- User comments are treated as data: they're wrapped in markers, a guard model checks them, injected instructions are stripped and logged to `jailbreak_attempts`, and the expense goes to manual review. Text hidden inside an image can still influence extraction, but the decision itself is never made by the model.
- Receipt images are served at unguessable UUID URLs without authentication.
- The rate limiting is in memory and per IP. Set a monthly budget on the OpenAI project.

---
built by [samkoBuilds](https://samkobuilds.com)
