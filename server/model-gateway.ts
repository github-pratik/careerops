import { randomUUID } from "node:crypto";
import { transaction, type Db } from "./db.js";
export const modelReady = () =>
  Boolean(process.env.GROQ_API_KEY) &&
  process.env.ALLOW_PERSONAL_DATA_TO_GROQ === "true";
export const MODEL = "openai/gpt-oss-20b";
export async function requestModelJson(
  db: Db,
  input: {
    taskKey: string;
    documentId?: string;
    system: string;
    data: unknown;
  },
) {
  if (!modelReady())
    throw new Error(
      "Connect the model provider and approve personal-data processing before using AI assistance.",
    );
  const serialized = JSON.stringify(input.data);
  if (serialized.length > 100000)
    throw new Error(
      "This task exceeds the model input limit. Shorten the source or select fewer facts.",
    );
  const callId = randomUUID();
  await transaction(db, async (c) => {
    const {
      rows: [settings],
    } = await c.query("SELECT * FROM co_settings FOR UPDATE");
    const {
      rows: [usage],
    } = await c.query(
      "SELECT coalesce(sum(coalesce(cost_usd,reserved_usd)),0)::float AS spent, count(*) FILTER (WHERE created_at>now()-interval '1 day')::int AS today FROM co_model_calls WHERE created_at>=date_trunc('month',now())",
    );
    const allowance = Math.min(
      6,
      Number(settings.preferences.monthlyBudgetUsd || 0) * 0.6,
    );
    if (usage.spent + 0.05 > allowance || usage.today >= 100)
      throw new Error(
        "Model allowance reached. Work can resume when the quota resets.",
      );
    const {
      rows: [active],
    } = await c.query(
      "SELECT id FROM co_model_calls WHERE task_key=$1 AND state='running' AND created_at>now()-interval '3 minutes'",
      [input.taskKey],
    );
    if (active) throw new Error("This task is already running.");
    await c.query(
      "INSERT INTO co_model_calls(id,document_id,task_key,model,state,reserved_usd) VALUES($1,$2,$3,$4,'running',0.05)",
      [callId, input.documentId || null, input.taskKey, MODEL],
    );
  });
  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(60000),
        headers: {
          authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0,
          max_completion_tokens: 5000,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: serialized },
          ],
        }),
      },
    );
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? "Provider quota reached. Retry later; this is not a rejected job."
          : `Model provider returned ${response.status}.`,
      );
    const body = (await response.json()) as any;
    const promptTokens = body.usage?.prompt_tokens,
      outputTokens = body.usage?.completion_tokens;
    const cost =
      Number.isFinite(promptTokens) && Number.isFinite(outputTokens)
        ? Math.max(0, (promptTokens * 0.075 + outputTokens * 0.3) / 1000000)
        : null;
    const output = JSON.parse(body.choices?.[0]?.message?.content || "");
    await db.query(
      "UPDATE co_model_calls SET state='complete',cost_usd=$2 WHERE id=$1",
      [callId, cost],
    );
    return { output, model: MODEL, callId };
  } catch (e) {
    await db.query(
      "UPDATE co_model_calls SET state='failed',error=$2 WHERE id=$1",
      [callId, (e as Error).message.slice(0, 300)],
    );
    throw e;
  }
}
