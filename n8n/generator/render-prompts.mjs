// Renders n8n/PROMPTS.md from prompts.mjs so the docs always match what the workflows send.
// Usage (from repo root): node n8n/generator/render-prompts.mjs > n8n/PROMPTS.md
import * as P from "./prompts.mjs";

const fence = (s) => "```text\n" + s + "\n```";
const out = `# Prompts used in the n8n workflows

> Generated from \`n8n/generator/prompts.mjs\` with \`node n8n/generator/render-prompts.mjs > n8n/PROMPTS.md\`.
> Do not edit by hand: change prompts.mjs, regenerate the workflows, bump the version and log it in [CHANGELOG.md](CHANGELOG.md).

Model: **GPT-6 Luna** (\`gpt-6-luna\`) for every chat node; \`text-embedding-3-small\` (1536 dims) for embeddings.
Credential: \`OpenAI\` (n8n → Credentials).

| Prompt | Version | Workflow → node |
|---|---|---|
| Jailbreak guard | \`${P.PROMPT_VERSION.guard}\` | Expense Intake → **Jailbreak guard** (Basic LLM Chain + Structured Output Parser) |
| Receipt extraction | \`${P.PROMPT_VERSION.extract}\` | Expense Intake → **Read receipt (vision)** and **Read comment (text only)** |
| CFO assistant | \`${P.PROMPT_VERSION.cfo}\` | CFO Assistant → **CFO assistant** (AI Agent, tools \`run_sql\` + \`search_expenses\`) |

Design rules that apply to all prompts:
- User text is wrapped in \`<<<COMMENT_START>>>\` / \`<<<COMMENT_END>>>\` markers and declared as data, never instructions.
- The model only extracts facts. **Approval is decided by n8n If/Switch/Set nodes** in *Expense Policy (rules)*, never by the model.
- Output is forced into a JSON schema by a Structured Output Parser, so a malformed answer fails the node and is routed to the error branch.
- Prompts contain no curly braces: LangChain would treat them as template variables.

---

## 1. Jailbreak guard (\`${P.PROMPT_VERSION.guard}\`)

### System message
${fence(P.GUARD_SYSTEM)}

### User message (n8n expression)
${fence(P.GUARD_HUMAN("{{ comment with { } replaced by ( ) }}"))}

### Output schema
\`is_jailbreak: boolean, injected_instructions: string[], clean_comment: string, reason: string\`

A deterministic regex second opinion (node **Guard verdict**) also flags common phrases such as "ignore previous instructions", "system prompt", "одобри автоматично", "DROP TABLE".
Flagged comments are stored in \`jailbreak_attempts\`, and the expense is forced to **Manual Review**.

---

## 2. Receipt extraction (\`${P.PROMPT_VERSION.extract}\`)

### System message
${fence(P.EXTRACT_SYSTEM)}

### User message: text part (n8n expression)
${fence(P.EXTRACT_HUMAN_TEXT("{{ cleaned comment }}", "yes | no"))}

### User message: image part (vision branch only)
\`data:<mime>;base64,<receipt>\` sent as an \`image_url\` message with \`detail: high\`.

### Output schema
\`readable, unreadable_reason, merchant, receipt_date (YYYY-MM-DD), amount, currency (ISO 4217), category (enum of 8), has_alcohol, items[name, quantity, price], description, confidence\`

---

## 3. CFO assistant (\`${P.PROMPT_VERSION.cfo}\`)

### System message
${fence(P.CFO_SYSTEM + "\n\nДнешна дата: {{ $now }}.")}

### Tool: run_sql (Postgres Tool, role \`cfo_readonly\`: SELECT only, read-only transactions, 5 s timeout)
- Description: ${P.CFO_SQL_TOOL_DESCRIPTION}
- \`$fromAI('sql')\` hint: ${P.CFO_SQL_FROM_AI}

### Tool: search_expenses (PGVector Store as tool over \`expense_embeddings\`, top 8)
- Description: ${P.CFO_VECTOR_TOOL_DESCRIPTION}
`;
process.stdout.write(out);
