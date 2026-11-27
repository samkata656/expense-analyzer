// Generates the n8n workflow JSON in n8n/workflows from code (prompts live in prompts.mjs).
// Usage (from repo root): node n8n/generator/build.mjs n8n/workflows
// After regenerating, add an entry to n8n/CHANGELOG.md and bump PROMPT_VERSION when a prompt changes.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as P from "./prompts.mjs";

const OUT = process.argv[2];
const MODEL = "gpt-6-luna"; // placeholder: swap in n8n to your exact GPT-6 Luna model id

export const IDS = {
  intake: "expIntake0000001",
  policy: "expPolicy0000001",
  errors: "expErrors0000001",
  cfo: "expCfoChat000001",
  harness: "expPolicyTest001",
};
export const CREDS = {
  pgApp: { id: "pgAppRw000000001", name: "Expenses DB (app_rw)" },
  pgCfo: { id: "pgCfoRead0000001", name: "Expenses DB (cfo_readonly)" },
  hdr: { id: "hdrWebhook000001", name: "Expense Webhook Secret" },
  openai: { id: "openAiMain000001", name: "OpenAI" },
};

// deterministic ids so regenerating does not create noisy diffs
const did = (seed) => {
  const h = createHash("sha1").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

function wf(name, id, nodes, connections, settings = {}) {
  return {
    id,
    name,
    nodes,
    connections,
    active: false,
    settings: { executionOrder: "v1", callerPolicy: "workflowsFromSameOwner", ...settings },
    pinData: {},
    tags: [],
    meta: { templateCredsSetupCompleted: true },
  };
}

function node(wfName, name, type, typeVersion, parameters, position, extra = {}) {
  return { parameters, id: did(`${wfName}/${name}`), name, type, typeVersion, position, ...extra };
}

// ---------- filter helpers (If / Switch) ----------
const cnd = (wfName, key, leftValue, operator, rightValue = "") => ({ id: did(`${wfName}/${key}`), leftValue, rightValue, operator });
const OP = {
  numLte: { type: "number", operation: "lte" },
  numGte: { type: "number", operation: "gte" },
  isTrue: { type: "boolean", operation: "true", singleValue: true },
  strNotEmpty: { type: "string", operation: "notEmpty", singleValue: true },
  strEq: { type: "string", operation: "equals" },
  exists: { type: "string", operation: "exists", singleValue: true },
  numExists: { type: "number", operation: "exists", singleValue: true },
};
const filter = (conditions, combinator = "and") => ({
  options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
  conditions,
  combinator,
});
const ifParams = (conditions, combinator) => ({ conditions: filter(conditions, combinator), looseTypeValidation: true, options: {} });

// ---------- Set helper ----------
const assign = (wfName, key, name, value, type = "string") => ({ id: did(`${wfName}/${key}/${name}`), name, value, type });
const setParams = (wfName, key, list, includeOther = true) => ({
  assignments: { assignments: list.map(([n, v, t]) => assign(wfName, key, n, v, t)) },
  includeOtherFields: includeOther,
  options: {},
});

// ---------- connection helpers ----------
function Conn() {
  const c = {};
  const add = (from, to, type = "main", fromIndex = 0, toIndex = 0) => {
    c[from] ??= {};
    c[from][type] ??= [];
    while (c[from][type].length <= fromIndex) c[from][type].push([]);
    c[from][type][fromIndex].push({ node: to, type, index: toIndex });
  };
  return { c, add };
}

const pgCred = (k) => ({ postgres: CREDS[k] });
const openAiCred = { openAiApi: CREDS.openai };
const logError = (wfName, name, codeLiteral, messageExpr, pos) =>
  node(
    wfName,
    name,
    "n8n-nodes-base.postgres",
    2.6,
    {
      operation: "executeQuery",
      query:
        "INSERT INTO error_logs (source, node, error_code, message, execution_id, payload)\nVALUES ('expense-intake', $1, $2, $3, $4, $5::jsonb)\nRETURNING id;",
      options: {
        queryReplacement: `={{ [ ${JSON.stringify(name)}, ${JSON.stringify(codeLiteral)}, String(${messageExpr}).slice(0, 2000), $execution.id, JSON.stringify({ employeeId: $('Webhook').first().json.body.employeeId ?? null, imageUrl: $('Webhook').first().json.body.imageUrl ?? null }) ] }}`,
      },
    },
    pos,
    { credentials: pgCred("pgApp"), alwaysOutputData: true, onError: "continueRegularOutput" },
  );

const errBody = (code, message, extra = "") => `={{ { ok: false, code: '${code}', message: '${message}'${extra} } }}`;

// ===================================================================================
// 1) expense-intake
// ===================================================================================
function buildIntake() {
  const W = "intake";
  const { c, add } = Conn();
  const body = "$('Webhook').first().json.body";
  const safeComment = `(${body}.comment ?? '').replaceAll('{', '(').replaceAll('}', ')')`;
  const nodes = [];
  const N = (...a) => {
    const n = node(W, ...a);
    nodes.push(n);
    return n;
  };

  N("Webhook", "n8n-nodes-base.webhook", 2.1, { httpMethod: "POST", path: "expense-intake", authentication: "headerAuth", responseMode: "responseNode", options: {} }, [0, 300], {
    webhookId: did("intake-webhook"),
    credentials: { httpHeaderAuth: CREDS.hdr },
  });

  N("Has receipt file?", "n8n-nodes-base.if", 2.2, ifParams([cnd(W, "hasfile", "={{ $binary.receipt?.mimeType ?? '' }}", OP.strNotEmpty)]), [220, 300]);
  N("Image to base64", "n8n-nodes-base.extractFromFile", 1.1, { operation: "binaryToPropery", binaryPropertyName: "receipt", destinationKey: "image_b64", options: {} }, [440, 200]);

  N(
    "Find employee",
    "n8n-nodes-base.postgres",
    2.6,
    {
      operation: "executeQuery",
      query:
        "-- Spec: only registered employees may submit expenses\nSELECT id, first_name, last_name, employee_code, role\nFROM users\nWHERE lower(first_name) = lower(btrim($1))\n  AND lower(last_name) = lower(btrim($2))\n  AND employee_code = btrim($3)\nLIMIT 1;",
      options: { queryReplacement: `={{ [ ${body}.firstName ?? '', ${body}.lastName ?? '', ${body}.employeeId ?? '' ] }}` },
    },
    [660, 300],
    { credentials: pgCred("pgApp"), alwaysOutputData: true },
  );
  N("Employee exists?", "n8n-nodes-base.if", 2.2, ifParams([cnd(W, "emp", "={{ $json.id ?? '' }}", OP.strNotEmpty)]), [880, 300]);
  N("Respond 403 not employee", "n8n-nodes-base.respondToWebhook", 1.4, {
    respondWith: "json",
    responseBody: errBody("EMPLOYEE_NOT_FOUND", "Служителят не е намерен."),
    options: { responseCode: 403 },
  }, [1100, 460]);

  N("Has comment?", "n8n-nodes-base.if", 2.2, ifParams([cnd(W, "hascomment", `={{ (${body}.comment ?? '').trim() }}`, OP.strNotEmpty)]), [1100, 200]);

  // --- jailbreak guard ---
  N(
    "Jailbreak guard",
    "@n8n/n8n-nodes-langchain.chainLlm",
    1.7,
    {
      promptType: "define",
      text: `=${P.GUARD_HUMAN(`{{ ${safeComment} }}`)}`,
      hasOutputParser: true,
      messages: { messageValues: [{ type: "SystemMessagePromptTemplate", message: P.GUARD_SYSTEM }] },
    },
    [1340, 80],
    { onError: "continueErrorOutput", retryOnFail: true, maxTries: 2 },
  );
  N("Luna (guard)", "@n8n/n8n-nodes-langchain.lmChatOpenAi", 1.2, { model: { __rl: true, mode: "id", value: MODEL }, options: {} }, [1260, 300], { credentials: openAiCred });
  N(
    "Guard output schema",
    "@n8n/n8n-nodes-langchain.outputParserStructured",
    1.3,
    {
      schemaType: "manual",
      inputSchema: JSON.stringify(
        {
          type: "object",
          properties: {
            is_jailbreak: { type: "boolean" },
            injected_instructions: { type: "array", items: { type: "string" } },
            clean_comment: { type: "string" },
            reason: { type: "string" },
          },
          required: ["is_jailbreak", "injected_instructions", "clean_comment", "reason"],
          additionalProperties: false,
        },
        null,
        2,
      ),
    },
    [1440, 300],
  );

  // Deterministic second opinion: obvious injection phrases are flagged even if the model misses them.
  const RX = String.raw`/(ignore|disregard|forget)\s+(all\s+|any\s+|the\s+)?(previous|prior|above)|system\s*prompt|you\s+are\s+now|developer\s+mode|jailbreak|\bDAN\b|(approve|accept)\s+(this|it|automatically)|mark\s+(it\s+|this\s+)?as\s+approved|set\s+status|игнорирай|забрави\s+(всички|предишните)|системн(ия|ият)\s+промпт|одобри\s+(това|автоматично)|маркирай\s+като\s+одобрен|drop\s+table|delete\s+from|<script/i`;
  N(
    "Guard verdict",
    "n8n-nodes-base.set",
    3.4,
    setParams(
      W,
      "verdict",
      [
        ["regex_hit", `={{ ${RX}.test(${body}.comment ?? '') }}`, "boolean"],
        ["is_jailbreak", `={{ $json.output.is_jailbreak === true || ${RX}.test(${body}.comment ?? '') }}`, "boolean"],
        [
          "injected_instructions",
          `={{ ($json.output.injected_instructions?.length ? $json.output.injected_instructions : (${RX}.test(${body}.comment ?? '') ? [${body}.comment] : [])) }}`,
          "array",
        ],
        [
          "clean_comment",
          `={{ ($json.output.is_jailbreak !== true && ${RX}.test(${body}.comment ?? '')) ? (${body}.comment ?? '').replace(${RX}g, '[премахнато]') : ($json.output.clean_comment ?? '') }}`,
          "string",
        ],
        ["guard_reason", "={{ $json.output.reason ?? '' }}", "string"],
      ],
      false,
    ),
    [1660, 80],
  );
  N(
    "No comment",
    "n8n-nodes-base.set",
    3.4,
    setParams(W, "nocomment", [
      ["is_jailbreak", "={{ false }}", "boolean"],
      ["injected_instructions", "={{ [] }}", "array"],
      ["clean_comment", "", "string"],
      ["guard_reason", "", "string"],
    ], false),
    [1340, 400],
  );
  N("Is jailbreak?", "n8n-nodes-base.if", 2.2, ifParams([cnd(W, "isjb", "={{ $json.is_jailbreak }}", OP.isTrue)]), [1880, 200]);
  N(
    "Log jailbreak attempt",
    "n8n-nodes-base.postgres",
    2.6,
    {
      operation: "executeQuery",
      query:
        "INSERT INTO jailbreak_attempts (user_id, raw_comment, extracted_instructions, clean_comment)\nVALUES ($1::uuid, $2, $3::jsonb, $4)\nRETURNING id;",
      options: {
        queryReplacement: `={{ [ $('Find employee').first().json.id, ${body}.comment ?? '', JSON.stringify($json.injected_instructions ?? []), $json.clean_comment ?? '' ] }}`,
      },
    },
    [2000, 100],
    { credentials: pgCred("pgApp"), onError: "continueRegularOutput", alwaysOutputData: true },
  );
  // The Postgres insert replaces the item, so bring the verdict back before merging the branches.
  N(
    "Restore verdict",
    "n8n-nodes-base.set",
    3.4,
    setParams(W, "restore", [
      ["is_jailbreak", "={{ true }}", "boolean"],
      ["clean_comment", "={{ $('Guard verdict').first().json.clean_comment ?? '' }}", "string"],
    ], false),
    [2210, 100],
  );
  N(
    "Guard result",
    "n8n-nodes-base.set",
    3.4,
    setParams(W, "guardresult", [
      ["force_manual_review", "={{ $json.is_jailbreak === true }}", "boolean"],
      ["clean_comment", "={{ $json.clean_comment ?? '' }}", "string"],
    ], false),
    [2420, 200],
  );

  // --- extraction ---
  N("Use vision?", "n8n-nodes-base.if", 2.2, ifParams([cnd(W, "vision", "={{ $('Webhook').first().binary?.receipt?.mimeType ?? '' }}", OP.strNotEmpty)]), [2540, 200]);
  const cleanSafe = "($('Guard result').first().json.clean_comment ?? '').replaceAll('{', '(').replaceAll('}', ')')";
  N(
    "Read receipt (vision)",
    "@n8n/n8n-nodes-langchain.chainLlm",
    1.7,
    {
      promptType: "define",
      text: `=${P.EXTRACT_HUMAN_TEXT(`{{ ${cleanSafe} }}`, "yes")}`,
      hasOutputParser: true,
      messages: {
        messageValues: [
          { type: "SystemMessagePromptTemplate", message: P.EXTRACT_SYSTEM },
          {
            type: "HumanMessagePromptTemplate",
            messageType: "imageUrl",
            imageUrl: "={{ 'data:' + $('Webhook').first().binary.receipt.mimeType + ';base64,' + $('Image to base64').first().json.image_b64 }}",
            imageDetail: "high",
          },
        ],
      },
    },
    [2780, 80],
    { onError: "continueErrorOutput", retryOnFail: true, maxTries: 2 },
  );
  N(
    "Read comment (text only)",
    "@n8n/n8n-nodes-langchain.chainLlm",
    1.7,
    {
      promptType: "define",
      text: `=${P.EXTRACT_HUMAN_TEXT(`{{ ${cleanSafe} }}`, "no")}`,
      hasOutputParser: true,
      messages: { messageValues: [{ type: "SystemMessagePromptTemplate", message: P.EXTRACT_SYSTEM }] },
    },
    [2780, 420],
    { onError: "continueErrorOutput", retryOnFail: true, maxTries: 2 },
  );
  N("Luna (extraction)", "@n8n/n8n-nodes-langchain.lmChatOpenAi", 1.2, { model: { __rl: true, mode: "id", value: MODEL }, options: {} }, [2700, 260], { credentials: openAiCred });
  const extractSchema = {
    type: "object",
    properties: {
      readable: { type: "boolean" },
      unreadable_reason: { type: ["string", "null"] },
      merchant: { type: ["string", "null"] },
      receipt_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
      amount: { type: ["number", "null"] },
      currency: { type: ["string", "null"], description: "ISO 4217, e.g. BGN, EUR" },
      category: { type: "string", enum: ["food", "business_meal", "cigarettes", "city_transport", "travel", "it_equipment", "training", "other"] },
      has_alcohol: { type: "boolean" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" }, quantity: { type: ["number", "null"] }, price: { type: ["number", "null"] } },
          required: ["name", "quantity", "price"],
          additionalProperties: false,
        },
      },
      description: { type: "string" },
      confidence: { type: "number" },
    },
    required: ["readable", "unreadable_reason", "merchant", "receipt_date", "amount", "currency", "category", "has_alcohol", "items", "description", "confidence"],
    additionalProperties: false,
  };
  N("Expense schema (vision)", "@n8n/n8n-nodes-langchain.outputParserStructured", 1.3, { schemaType: "manual", inputSchema: JSON.stringify(extractSchema, null, 2) }, [2880, 260]);
  N("Expense schema (text)", "@n8n/n8n-nodes-langchain.outputParserStructured", 1.3, { schemaType: "manual", inputSchema: JSON.stringify(extractSchema, null, 2) }, [2880, 600]);

  N(
    "Readable with amount?",
    "n8n-nodes-base.if",
    2.2,
    ifParams([
      cnd(W, "readable", "={{ $json.output.readable }}", OP.isTrue),
      cnd(W, "amount", "={{ $json.output.amount }}", OP.numGte, 0),
      cnd(W, "currency", "={{ $json.output.currency ?? '' }}", OP.strNotEmpty),
    ]),
    [3060, 200],
  );
  nodes.push(logError(W, "Log unreadable receipt", "RECEIPT_UNREADABLE", "$json.output?.unreadable_reason ?? 'no amount/currency extracted'", [3280, 420]));
  N(
    "Respond 422 unreadable",
    "n8n-nodes-base.respondToWebhook",
    1.4,
    {
      respondWith: "json",
      responseBody: `={{ { ok: false, code: $('Readable with amount?').first().json.output?.readable === false ? 'RECEIPT_UNREADABLE' : 'MISSING_AMOUNT', message: 'Неуспешно разчитане.', details: $('Readable with amount?').first().json.output?.unreadable_reason ?? null } }}`,
      options: { responseCode: 422 },
    },
    [3500, 420],
  );
  nodes.push(logError(W, "Log AI error", "AI_ERROR", "$json.message ?? $json.error?.message ?? JSON.stringify($json.error ?? 'AI node failed')", [3060, 640]));
  N("Respond 502 AI error", "n8n-nodes-base.respondToWebhook", 1.4, { respondWith: "json", responseBody: errBody("AI_ERROR", "AI анализът е недостъпен."), options: { responseCode: 502 } }, [3280, 640]);

  N(
    "Policy input",
    "n8n-nodes-base.set",
    3.4,
    setParams(W, "policyinput", [
      ["user_id", "={{ $('Find employee').first().json.id }}", "string"],
      ["employee_name", "={{ $('Find employee').first().json.first_name + ' ' + $('Find employee').first().json.last_name }}", "string"],
      ["employee_code", "={{ $('Find employee').first().json.employee_code }}", "string"],
      ["image_url", `={{ ${body}.imageUrl ?? '' }}`, "string"],
      ["comment", `={{ ${body}.comment ?? '' }}`, "string"],
      ["merchant", "={{ $json.output.merchant ?? '' }}", "string"],
      ["receipt_date", "={{ /^\\d{4}-\\d{2}-\\d{2}$/.test($json.output.receipt_date ?? '') && DateTime.fromISO($json.output.receipt_date).isValid ? $json.output.receipt_date : '' }}", "string"],
      ["amount", "={{ Number($json.output.amount) }}", "number"],
      ["currency", "={{ String($json.output.currency ?? '').trim().toUpperCase() }}", "string"],
      ["category", "={{ $json.output.category ?? 'other' }}", "string"],
      ["has_alcohol", "={{ $json.output.has_alcohol === true }}", "boolean"],
      ["items", "={{ $json.output.items ?? [] }}", "array"],
      ["description", "={{ $json.output.description ?? '' }}", "string"],
      ["force_manual_review", "={{ $('Guard result').first().json.force_manual_review }}", "boolean"],
      ["ai_raw", "={{ $json.output }}", "object"],
    ], false),
    [3280, 180],
  );
  N(
    "Apply expense policy",
    "n8n-nodes-base.executeWorkflow",
    1.2,
    {
      source: "database",
      workflowId: { __rl: true, mode: "list", value: IDS.policy, cachedResultName: "Expense Policy (rules)" },
      workflowInputs: { mappingMode: "defineBelow", value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: true },
      mode: "once",
      options: { waitForSubWorkflow: true },
    },
    [3500, 180],
  );
  N(
    "Save expense",
    "n8n-nodes-base.postgres",
    2.6,
    {
      operation: "executeQuery",
      query: `INSERT INTO expenses (
  user_id, image_url, merchant, receipt_date, amount, currency, amount_bgn, amount_eur,
  category, has_alcohol, items, description, comment, status, status_reason, policy, ai_raw
) VALUES (
  $1::uuid,
  NULLIF($2, ''),
  NULLIF($3, ''),
  NULLIF($4, '')::date,
  $5::numeric,
  $6,
  NULLIF($7, '')::numeric,
  NULLIF($8, '')::numeric,
  $9::expense_category,
  $10::boolean,
  $11::jsonb,
  NULLIF($12, ''),
  NULLIF($13, ''),
  $14::expense_status,
  $15,
  $16,
  $17::jsonb
)
RETURNING id, merchant, to_char(receipt_date, 'YYYY-MM-DD') AS receipt_date, amount, currency,
          amount_bgn, amount_eur, category, has_alcohol, status, status_reason, policy, image_url, created_at;`,
      options: {
        queryReplacement:
          "={{ [ $json.user_id, $json.image_url, $json.merchant, $json.receipt_date, String($json.amount), $json.currency, $json.amount_bgn == null ? '' : String($json.amount_bgn), $json.amount_eur == null ? '' : String($json.amount_eur), $json.category, String($json.has_alcohol), JSON.stringify($json.items ?? []), $json.description, $json.comment, $json.status, $json.status_reason, $json.policy, JSON.stringify($json.ai_raw ?? {}) ] }}",
        largeNumbersOutput: "numbers",
      },
    },
    [3720, 180],
    { credentials: pgCred("pgApp"), onError: "continueErrorOutput" },
  );
  nodes.push(logError(W, "Log DB error", "DB_ERROR", "$json.message ?? $json.error?.message ?? JSON.stringify($json.error ?? 'insert failed')", [3940, 420]));
  N("Respond 500 DB error", "n8n-nodes-base.respondToWebhook", 1.4, { respondWith: "json", responseBody: errBody("DB_ERROR", "Грешка при запис."), options: { responseCode: 500 } }, [4160, 420]);

  // --- embeddings for the CFO assistant (best effort) ---
  N(
    "Embedding text",
    "n8n-nodes-base.set",
    3.4,
    setParams(W, "embtext", [
      ["expense_id", "={{ $json.id }}", "string"],
      [
        "embedding_text",
        "={{ 'Разход от ' + $('Policy input').first().json.employee_name + ' (служебен номер ' + $('Policy input').first().json.employee_code + '). Търговец: ' + ($json.merchant ?? 'неизвестен') + '. Дата: ' + ($json.receipt_date ?? 'няма') + '. Сума: ' + $json.amount + ' ' + $json.currency + ($json.amount_eur != null ? ' (' + $json.amount_eur + ' EUR)' : '') + '. Категория: ' + $json.category + '. Статус: ' + $json.status + '. Причина: ' + $json.status_reason + '. Описание: ' + ($('Policy input').first().json.description ?? '') }}",
        "string",
      ],
      ["user_id", "={{ $('Policy input').first().json.user_id }}", "string"],
      ["employee_code", "={{ $('Policy input').first().json.employee_code }}", "string"],
      ["status", "={{ $json.status }}", "string"],
      ["category", "={{ $json.category }}", "string"],
    ], false),
    [3940, 80],
  );
  N(
    "Store expense vector",
    "@n8n/n8n-nodes-langchain.vectorStorePGVector",
    1.3,
    { mode: "insert", tableName: "expense_embeddings", options: { skipInitializationCheck: true } },
    [4160, 80],
    { credentials: pgCred("pgApp"), onError: "continueRegularOutput", alwaysOutputData: true },
  );
  N(
    "Expense document",
    "@n8n/n8n-nodes-langchain.documentDefaultDataLoader",
    1.1,
    {
      jsonMode: "expressionData",
      jsonData: "={{ $json.embedding_text }}",
      textSplittingMode: "simple",
      options: {
        metadata: {
          metadataValues: [
            { name: "expense_id", value: "={{ $json.expense_id }}" },
            { name: "user_id", value: "={{ $json.user_id }}" },
            { name: "employee_code", value: "={{ $json.employee_code }}" },
            { name: "status", value: "={{ $json.status }}" },
            { name: "category", value: "={{ $json.category }}" },
          ],
        },
      },
    },
    [4260, 300],
  );
  N("Embeddings (intake)", "@n8n/n8n-nodes-langchain.embeddingsOpenAi", 1.2, { options: {} }, [4100, 300], { credentials: openAiCred });
  N(
    "Respond 201 saved",
    "n8n-nodes-base.respondToWebhook",
    1.4,
    {
      respondWith: "json",
      responseBody: "={{ { ok: true, expense: $('Save expense').first().json, jailbreak_detected: $('Guard result').first().json.force_manual_review } }}",
      options: { responseCode: 201 },
    },
    [4380, 80],
  );

  // connections
  add("Webhook", "Has receipt file?");
  add("Has receipt file?", "Image to base64", "main", 0);
  add("Has receipt file?", "Find employee", "main", 1);
  add("Image to base64", "Find employee");
  add("Find employee", "Employee exists?");
  add("Employee exists?", "Has comment?", "main", 0);
  add("Employee exists?", "Respond 403 not employee", "main", 1);
  add("Has comment?", "Jailbreak guard", "main", 0);
  add("Has comment?", "No comment", "main", 1);
  add("Luna (guard)", "Jailbreak guard", "ai_languageModel");
  add("Guard output schema", "Jailbreak guard", "ai_outputParser");
  add("Jailbreak guard", "Guard verdict", "main", 0);
  add("Jailbreak guard", "Log AI error", "main", 1);
  add("Guard verdict", "Is jailbreak?");
  add("No comment", "Is jailbreak?");
  add("Is jailbreak?", "Log jailbreak attempt", "main", 0);
  add("Is jailbreak?", "Guard result", "main", 1);
  add("Log jailbreak attempt", "Restore verdict");
  add("Restore verdict", "Guard result");
  add("Guard result", "Use vision?");
  add("Use vision?", "Read receipt (vision)", "main", 0);
  add("Use vision?", "Read comment (text only)", "main", 1);
  add("Luna (extraction)", "Read receipt (vision)", "ai_languageModel");
  add("Luna (extraction)", "Read comment (text only)", "ai_languageModel");
  add("Expense schema (vision)", "Read receipt (vision)", "ai_outputParser");
  add("Expense schema (text)", "Read comment (text only)", "ai_outputParser");
  add("Read receipt (vision)", "Readable with amount?", "main", 0);
  add("Read receipt (vision)", "Log AI error", "main", 1);
  add("Read comment (text only)", "Readable with amount?", "main", 0);
  add("Read comment (text only)", "Log AI error", "main", 1);
  add("Log AI error", "Respond 502 AI error");
  add("Readable with amount?", "Policy input", "main", 0);
  add("Readable with amount?", "Log unreadable receipt", "main", 1);
  add("Log unreadable receipt", "Respond 422 unreadable");
  add("Policy input", "Apply expense policy");
  add("Apply expense policy", "Save expense");
  add("Save expense", "Embedding text", "main", 0);
  add("Save expense", "Log DB error", "main", 1);
  add("Log DB error", "Respond 500 DB error");
  add("Embedding text", "Store expense vector");
  add("Embeddings (intake)", "Store expense vector", "ai_embedding");
  add("Expense document", "Store expense vector", "ai_document");
  add("Store expense vector", "Respond 201 saved");

  return wf("Expense Intake (webhook → AI → policy → DB)", IDS.intake, nodes, c, { errorWorkflow: IDS.errors });
}

// ===================================================================================
// 2) expense-policy  (no Code node: Set / If / Switch only)
// ===================================================================================
function buildPolicy() {
  const W = "policy";
  const { c, add } = Conn();
  const nodes = [];
  const N = (...a) => {
    const n = node(W, ...a);
    nodes.push(n);
    return n;
  };
  const decision = (name, status, policy, reason, pos) =>
    N(name, "n8n-nodes-base.set", 3.4, setParams(W, name, [["status", status], ["policy", policy], ["status_reason", reason]]), pos);

  N("When called by intake", "n8n-nodes-base.executeWorkflowTrigger", 1.1, { inputSource: "passthrough" }, [0, 400]);
  N(
    "Convert to BGN / EUR",
    "n8n-nodes-base.set",
    3.4,
    setParams(W, "convert", [
      ["currency", "={{ String($json.currency ?? '').trim().toUpperCase() }}", "string"],
      ["amount", "={{ Number($json.amount) }}", "number"],
      [
        "amount_bgn",
        "={{ String($json.currency ?? '').trim().toUpperCase() === 'BGN' ? Math.round(Number($json.amount) * 100) / 100 : (String($json.currency ?? '').trim().toUpperCase() === 'EUR' ? Math.round(Number($json.amount) * 1.95583 * 100) / 100 : null) }}",
        "number",
      ],
      [
        "amount_eur",
        "={{ String($json.currency ?? '').trim().toUpperCase() === 'EUR' ? Math.round(Number($json.amount) * 100) / 100 : (String($json.currency ?? '').trim().toUpperCase() === 'BGN' ? Math.round(Number($json.amount) / 1.95583 * 100) / 100 : null) }}",
        "number",
      ],
    ]),
    [220, 400],
  );
  N("Currency supported?", "n8n-nodes-base.if", 2.2, ifParams([cnd(W, "cur", "={{ $json.amount_bgn }}", OP.numExists)]), [440, 400]);
  decision("Unsupported currency → review", "manual_review", "P8", "=Валута {{ $json.currency }} не се конвертира автоматично (само BGN и EUR). Изисква ръчен преглед.", [660, 640]);
  N("Suspicious comment?", "n8n-nodes-base.if", 2.2, ifParams([cnd(W, "susp", "={{ $json.force_manual_review }}", OP.isTrue)]), [660, 400]);
  decision("Jailbreak → review", "manual_review", "SECURITY", "Съмнителен коментар: открити са опити за манипулация на AI. Разходът изисква ръчен преглед.", [880, 640]);

  const cats = ["food", "business_meal", "cigarettes", "city_transport", "travel", "it_equipment", "training"];
  N(
    "Route by category",
    "n8n-nodes-base.switch",
    3.2,
    {
      rules: {
        values: cats.map((cat) => ({
          conditions: filter([cnd(W, `sw-${cat}`, "={{ $json.category }}", OP.strEq, cat)]),
          renameOutput: true,
          outputKey: cat,
        })),
      },
      looseTypeValidation: true,
      options: { fallbackOutput: "extra", renameFallbackOutput: "other" },
    },
    [880, 360],
  );

  const bgn = "{{ $json.amount_bgn.toFixed(2) }} лв.";
  // P1 food
  N("Food: alcohol?", "n8n-nodes-base.if", 2.2, ifParams([cnd(W, "alc", "={{ $json.has_alcohol }}", OP.isTrue)]), [1160, 0]);
  decision("P1 reject: alcohol", "rejected", "P1", "=Политика 1: в разходите за храна не се допуска алкохол. Разходът е отказан автоматично.", [1400, -80]);
  N("Food ≤ 50 лв?", "n8n-nodes-base.if", 2.2, ifParams([cnd(W, "food50", "={{ $json.amount_bgn }}", OP.numLte, 50)]), [1400, 60]);
  decision("P1 approve", "approved", "P1", `=Политика 1: храна до 50 лв. (${bgn}). Одобрен автоматично.`, [1640, 0]);
  decision("P1 manual review", "manual_review", "P1", `=Политика 1: храна над 50 лв. (${bgn}). Изисква ръчно одобрение.`, [1640, 120]);
  // P2 business meal
  N("Meal ≤ 400 лв?", "n8n-nodes-base.if", 2.2, ifParams([cnd(W, "meal400", "={{ $json.amount_bgn }}", OP.numLte, 400)]), [1160, 240]);
  decision("P2 approve", "approved", "P2", `=Политика 2: служебен обяд/вечеря до 400 лв. (${bgn}), алкохолът е допустим. Одобрен автоматично.`, [1400, 200]);
  decision("P2 manual review", "manual_review", "P2", `=Политика 2: служебен обяд/вечеря над 400 лв. (${bgn}). Изисква ръчен преглед.`, [1400, 300]);
  // P3 cigarettes
  decision("P3 reject: cigarettes", "rejected", "P3", "Политика 3: персонални разходи за цигари не се одобряват.", [1160, 400]);
  // P4 transport
  N("Transport ≤ 30 лв?", "n8n-nodes-base.if", 2.2, ifParams([cnd(W, "tr30", "={{ $json.amount_bgn }}", OP.numLte, 30)]), [1160, 540]);
  decision("P4 approve", "approved", "P4", `=Политика 4: градски транспорт/такси до 30 лв. (${bgn}). Одобрен автоматично.`, [1400, 500]);
  decision("P4 reject", "rejected", "P4", `=Политика 4: градски транспорт/такси над 30 лв. (${bgn}). Отказан автоматично.`, [1400, 600]);
  // P5 travel
  decision("P5 manual review", "manual_review", "P5", "Политика 5: пътуване извън града/държавата се одобрява ръчно.", [1160, 700]);
  // P6 IT
  N("IT ≤ 600 лв?", "n8n-nodes-base.if", 2.2, ifParams([cnd(W, "it600", "={{ $json.amount_bgn }}", OP.numLte, 600)]), [1160, 840]);
  decision("P6 approve", "approved", "P6", `=Политика 6: техника до 600 лв. (${bgn}). Одобрен автоматично.`, [1400, 800]);
  decision("P6 reject", "rejected", "P6", `=Политика 6: техника над 600 лв. (${bgn}). Отказан автоматично.`, [1400, 900]);
  // P7 training
  decision("P7 approve", "approved", "P7", "Политика 7: курсове и обучения, свързани с дейността, се одобряват автоматично без оглед на цената.", [1160, 1000]);
  // P8 other
  decision("P8 manual review", "manual_review", "P8", "Политика 8: разходът не попада в автоматичните правила. Изисква ръчен преглед.", [1160, 1140]);

  N("Decision", "n8n-nodes-base.noOp", 1, {}, [1900, 500]);

  add("When called by intake", "Convert to BGN / EUR");
  add("Convert to BGN / EUR", "Currency supported?");
  add("Currency supported?", "Suspicious comment?", "main", 0);
  add("Currency supported?", "Unsupported currency → review", "main", 1);
  add("Suspicious comment?", "Jailbreak → review", "main", 0);
  add("Suspicious comment?", "Route by category", "main", 1);
  const swTargets = ["Food: alcohol?", "Meal ≤ 400 лв?", "P3 reject: cigarettes", "Transport ≤ 30 лв?", "P5 manual review", "IT ≤ 600 лв?", "P7 approve", "P8 manual review"];
  swTargets.forEach((t, i) => add("Route by category", t, "main", i));
  add("Food: alcohol?", "P1 reject: alcohol", "main", 0);
  add("Food: alcohol?", "Food ≤ 50 лв?", "main", 1);
  add("Food ≤ 50 лв?", "P1 approve", "main", 0);
  add("Food ≤ 50 лв?", "P1 manual review", "main", 1);
  add("Meal ≤ 400 лв?", "P2 approve", "main", 0);
  add("Meal ≤ 400 лв?", "P2 manual review", "main", 1);
  add("Transport ≤ 30 лв?", "P4 approve", "main", 0);
  add("Transport ≤ 30 лв?", "P4 reject", "main", 1);
  add("IT ≤ 600 лв?", "P6 approve", "main", 0);
  add("IT ≤ 600 лв?", "P6 reject", "main", 1);
  for (const n of nodes.filter((x) => x.type === "n8n-nodes-base.set" && x.name !== "Convert to BGN / EUR")) add(n.name, "Decision");

  return wf("Expense Policy (rules)", IDS.policy, nodes, c);
}

// ===================================================================================
// 3) error handler
// ===================================================================================
function buildErrors() {
  const W = "errors";
  const { c, add } = Conn();
  const nodes = [
    node(W, "Error Trigger", "n8n-nodes-base.errorTrigger", 1, {}, [0, 300]),
    node(
      W,
      "Log to error_logs",
      "n8n-nodes-base.postgres",
      2.6,
      {
        operation: "executeQuery",
        query:
          "INSERT INTO error_logs (source, node, error_code, message, execution_id, payload)\nVALUES ($1, $2, 'WORKFLOW_ERROR', $3, $4, $5::jsonb)\nRETURNING id;",
        options: {
          queryReplacement:
            "={{ [ $json.workflow?.name ?? 'unknown', $json.execution?.lastNodeExecuted ?? $json.trigger?.error?.node?.name ?? '', String($json.execution?.error?.message ?? $json.trigger?.error?.message ?? 'unknown error').slice(0, 2000), String($json.execution?.id ?? ''), JSON.stringify({ workflowId: $json.workflow?.id ?? null, mode: $json.execution?.mode ?? null, url: $json.execution?.url ?? null, stack: String($json.execution?.error?.stack ?? '').slice(0, 4000) }) ] }}",
        },
      },
      [240, 300],
      { credentials: pgCred("pgApp") },
    ),
  ];
  add("Error Trigger", "Log to error_logs");
  return wf("Error Handler (log to error_logs)", IDS.errors, nodes, c);
}

// ===================================================================================
// 4) CFO assistant
// ===================================================================================
function buildCfo() {
  const W = "cfo";
  const { c, add } = Conn();
  const body = "$('Webhook').first().json.body";
  const nodes = [];
  const N = (...a) => {
    const n = node(W, ...a);
    nodes.push(n);
    return n;
  };
  N("Webhook", "n8n-nodes-base.webhook", 2.1, { httpMethod: "POST", path: "cfo-chat", authentication: "headerAuth", responseMode: "responseNode", options: {} }, [0, 300], {
    webhookId: did("cfo-webhook"),
    credentials: { httpHeaderAuth: CREDS.hdr },
  });
  N(
    "Find CFO",
    "n8n-nodes-base.postgres",
    2.6,
    {
      operation: "executeQuery",
      query:
        "SELECT id, first_name, last_name\nFROM users\nWHERE lower(first_name) = lower(btrim($1))\n  AND lower(last_name) = lower(btrim($2))\n  AND employee_code = btrim($3)\n  AND role = 'cfo'\nLIMIT 1;",
      options: { queryReplacement: `={{ [ ${body}.firstName ?? '', ${body}.lastName ?? '', ${body}.employeeId ?? '' ] }}` },
    },
    [220, 300],
    { credentials: pgCred("pgApp"), alwaysOutputData: true },
  );
  N("Is CFO?", "n8n-nodes-base.if", 2.2, ifParams([cnd(W, "cfo", "={{ $json.id ?? '' }}", OP.strNotEmpty)]), [440, 300]);
  N("Respond 403 not CFO", "n8n-nodes-base.respondToWebhook", 1.4, { respondWith: "json", responseBody: errBody("NOT_CFO", "Достъпът е само за финансовия директор."), options: { responseCode: 403 } }, [660, 480]);
  N(
    "CFO assistant",
    "@n8n/n8n-nodes-langchain.agent",
    3.1,
    {
      promptType: "define",
      text: `={{ ${body}.message }}`,
      options: { systemMessage: `=${P.CFO_SYSTEM}\n\nДнешна дата: {{ $now.toFormat('yyyy-MM-dd') }}.`, maxIterations: 8, enableStreaming: false },
    },
    [700, 200],
    { onError: "continueErrorOutput" },
  );
  // Responses API (v1.3): GPT-6 Luna only supports function tools there, not in /chat/completions
  N("Luna (CFO)", "@n8n/n8n-nodes-langchain.lmChatOpenAi", 1.3, { model: { __rl: true, mode: "id", value: MODEL }, responsesApiEnabled: true, builtInTools: {}, options: {} }, [520, 460], { credentials: openAiCred });
  N(
    "Chat memory",
    "@n8n/n8n-nodes-langchain.memoryPostgresChat",
    1.3,
    { sessionIdType: "customKey", sessionKey: `=cfo-{{ ${body}.sessionId }}`, tableName: "cfo_chat_histories", contextWindowLength: 10 },
    [660, 460],
    { credentials: pgCred("pgApp") },
  );
  N(
    "run_sql",
    "n8n-nodes-base.postgresTool",
    2.6,
    {
      descriptionType: "manual",
      toolDescription: P.CFO_SQL_TOOL_DESCRIPTION,
      operation: "executeQuery",
      query: `={{ $fromAI('sql', ${JSON.stringify(P.CFO_SQL_FROM_AI)}, 'string') }}`,
      options: { largeNumbersOutput: "numbers" },
    },
    [800, 460],
    { credentials: pgCred("pgCfo") },
  );
  N(
    "search_expenses",
    "@n8n/n8n-nodes-langchain.vectorStorePGVector",
    1.3,
    { mode: "retrieve-as-tool", toolDescription: P.CFO_VECTOR_TOOL_DESCRIPTION, tableName: "expense_embeddings", topK: 8, includeDocumentMetadata: true, options: { skipInitializationCheck: true } },
    [960, 460],
    { credentials: pgCred("pgCfo") },
  );
  N("Embeddings (CFO)", "@n8n/n8n-nodes-langchain.embeddingsOpenAi", 1.2, { options: {} }, [960, 640], { credentials: openAiCred });
  N("Has reply?", "n8n-nodes-base.if", 2.2, ifParams([cnd(W, "reply", "={{ typeof $json.output === 'string' ? $json.output.trim() : '' }}", OP.strNotEmpty)]), [920, 200]);
  N("Respond 200 reply", "n8n-nodes-base.respondToWebhook", 1.4, { respondWith: "json", responseBody: "={{ { ok: true, reply: $json.output } }}", options: { responseCode: 200 } }, [1140, 200]);
  N(
    "Log CFO error",
    "n8n-nodes-base.postgres",
    2.6,
    {
      operation: "executeQuery",
      query: "INSERT INTO error_logs (source, node, error_code, message, execution_id)\nVALUES ('cfo-assistant', 'CFO assistant', 'AI_ERROR', $1, $2)\nRETURNING id;",
      options: { queryReplacement: "={{ [ String($json.message ?? $json.error?.message ?? JSON.stringify($json.error ?? 'agent returned no answer')).slice(0, 2000), $execution.id ] }}" },
    },
    [1060, 360],
    { credentials: pgCred("pgApp"), onError: "continueRegularOutput", alwaysOutputData: true },
  );
  N("Respond 502 AI error", "n8n-nodes-base.respondToWebhook", 1.4, { respondWith: "json", responseBody: errBody("AI_ERROR", "AI асистентът е недостъпен."), options: { responseCode: 502 } }, [1280, 360]);

  add("Webhook", "Find CFO");
  add("Find CFO", "Is CFO?");
  add("Is CFO?", "CFO assistant", "main", 0);
  add("Is CFO?", "Respond 403 not CFO", "main", 1);
  add("Luna (CFO)", "CFO assistant", "ai_languageModel");
  add("Chat memory", "CFO assistant", "ai_memory");
  add("run_sql", "CFO assistant", "ai_tool");
  add("search_expenses", "CFO assistant", "ai_tool");
  add("Embeddings (CFO)", "search_expenses", "ai_embedding");
  add("CFO assistant", "Has reply?", "main", 0);
  add("Has reply?", "Respond 200 reply", "main", 0);
  add("Has reply?", "Log CFO error", "main", 1);
  add("CFO assistant", "Log CFO error", "main", 1);
  add("Log CFO error", "Respond 502 AI error");
  return wf("CFO Assistant (chat over expenses)", IDS.cfo, nodes, c, { errorWorkflow: IDS.errors });
}

// ===================================================================================
// 5) policy test harness (CI / local only)
// ===================================================================================
function buildHarness() {
  const W = "harness";
  const { c, add } = Conn();
  const nodes = [
    node(W, "Webhook", "n8n-nodes-base.webhook", 2.1, { httpMethod: "POST", path: "policy-test", responseMode: "lastNode", responseData: "allEntries", options: {} }, [0, 300], {
      webhookId: did("harness-webhook"),
    }),
    node(W, "Split cases", "n8n-nodes-base.splitOut", 1, { fieldToSplitOut: "body.cases", options: {} }, [220, 300]),
    node(
      W,
      "Apply expense policy",
      "n8n-nodes-base.executeWorkflow",
      1.2,
      {
        source: "database",
        workflowId: { __rl: true, mode: "list", value: IDS.policy, cachedResultName: "Expense Policy (rules)" },
        workflowInputs: { mappingMode: "defineBelow", value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: true },
        mode: "each",
        options: { waitForSubWorkflow: true },
      },
      [440, 300],
    ),
  ];
  add("Webhook", "Split cases");
  add("Split cases", "Apply expense policy");
  return wf("TEST ONLY: Policy harness", IDS.harness, nodes, c);
}

fs.mkdirSync(OUT, { recursive: true });
const files = {
  "expense-intake.json": buildIntake(),
  "expense-policy.json": buildPolicy(),
  "error-handler.json": buildErrors(),
  "cfo-assistant.json": buildCfo(),
};
for (const [f, w] of Object.entries(files)) fs.writeFileSync(path.join(OUT, f), JSON.stringify(w, null, 2) + "\n");
const testDir = path.join(OUT, "..", "test-workflows");
fs.mkdirSync(testDir, { recursive: true });
fs.writeFileSync(path.join(testDir, "policy-test-harness.json"), JSON.stringify(buildHarness(), null, 2) + "\n");
console.log("wrote", Object.keys(files).join(", "), "+ policy-test-harness.json");
