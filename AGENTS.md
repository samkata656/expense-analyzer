# AGENTS.md

Guidance for AI coding agents (Codex, Claude Code) working in this repository.

## Project map
- `apps/web`: Next.js 16 (App Router, Node 26). The UI is in Bulgarian, and the API routes live in `src/app/api`. Read `apps/web/AGENTS.md` before touching Next.js code: this Next.js version has breaking changes, and its docs ship in `node_modules/next/dist/docs/`.
- `n8n/`: workflows are **generated**. Edit `n8n/generator/build.mjs` and `prompts.mjs`, then run `node n8n/generator/build.mjs n8n/workflows` and `node n8n/generator/render-prompts.mjs > n8n/PROMPTS.md`. Never hand-edit `n8n/workflows/*.json`. Every workflow or prompt change needs an entry in `n8n/CHANGELOG.md` and a prompt version bump.
- `db/`: Postgres 18 + pgvector image. `init/00-init.sh` creates the roles and databases. `migrations/*.sql` are applied by the web app at startup, in order, and only once (`schema_migrations`). Never edit an applied migration: add a new numbered file.
- `docker-compose.yml` is the production Portainer stack (GHCR images). `docker-compose.dev.yml` is for local development and CI.

## Commands (from `apps/web`)
- `npm run lint`, `npm run typecheck`
- `npm test`: Vitest unit + API integration tests. These need the dev Postgres from `docker compose -f docker-compose.dev.yml up -d postgres`.
- `npm run e2e`: Playwright against the standalone build with a stubbed n8n.
- From the repo root: `node --test tests/policy.test.mjs` needs dev n8n running with the test harness.

## Review guidelines
Codex: when reviewing a pull request, focus on these points and flag violations as P0/P1.

1. **Secrets**: no API keys, passwords, tokens or real `.env` files in the diff. Only `.env.example` with placeholder values is allowed. The OpenAI key lives only in the n8n credential or the `OPENAI_API_KEY` env var.
2. **SQL**: every query is parameterised (`postgres` tagged templates in the app, `$1` + `queryReplacement` in n8n). No string-built SQL from user input.
3. **Policy logic stays in n8n If/Switch/Set nodes**, never in a Code node and never decided by the LLM. The model only extracts and structures data. Check limits against the spec: food ≤ 50 лв with no alcohol; business meal ≤ 400 лв; cigarettes rejected; taxi ≤ 30 лв; travel goes to manual review; IT ≤ 600 лв; training approved; other goes to manual review. EUR uses the fixed rate 1.95583, and any other currency goes to manual review.
4. **Prompt injection**: user text reaches models only inside the comment markers and the user message, never in a system prompt. Prompts contain no curly braces. Jailbreak attempts are logged to `jailbreak_attempts` and force manual review.
5. **Identity and access**: employee codes are the login secret. `cfo_readonly` must not be able to read `users.employee_code`, and codes must not appear in embeddings, logs or AI answers. CFO-only routes check `role = 'cfo'` on the server.
6. **Uploads**: the type is checked by magic bytes, the size limit is 10 MB, and stored names are UUIDs. Serving uses `isSafeStoredName` (no path traversal) and sends `nosniff`.
7. **Errors**: the API returns `{ ok: false, code, message }` with a Bulgarian, non-blaming message from `src/lib/errors.ts`. No stack traces go to the client.
8. **Tests**: behaviour changes come with tests (Vitest, `tests/policy-cases.json` for rules, Playwright for UI flows).
9. **CI**: third-party actions are pinned to a commit SHA, with minimal `permissions`. No `pull_request_target`.

Lower priority: style nits, the Tailwind class order and copy wording, unless the copy is wrong or not in Bulgarian.
