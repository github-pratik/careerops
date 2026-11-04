import { z } from "zod";
import { plain } from "./sources.js";
const question = z.object({
  label: z.string().max(1500),
  required: z.boolean().default(false),
  fields: z
    .array(
      z.object({
        name: z.string().max(150),
        type: z.string().max(100),
        values: z
          .array(
            z.object({
              value: z.union([z.string(), z.number()]),
              label: z.string().max(1000),
            }),
          )
          .nullish()
          .transform((v) => v || []),
      }),
    )
    .max(20),
});
const formSchema = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string().max(500),
  questions: z.array(question).max(60),
  location_questions: z
    .array(question)
    .max(20)
    .nullish()
    .transform((v) => v || []),
  compliance: z
    .array(question)
    .max(30)
    .nullish()
    .transform((v) => v || []),
  data_compliance: z
    .array(z.record(z.string(), z.unknown()))
    .nullish()
    .transform((v) => v || []),
  demographic_questions: z.unknown().optional(),
});
export async function greenhouseForm(board: string, jobId: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(board) || !/^\d+$/.test(jobId))
    throw new Error("Unsupported Greenhouse board or job identifier.");
  const response = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${jobId}?questions=true`,
    { redirect: "error", signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok)
    throw new Error(`Employer form returned ${response.status}.`);
  const reader = response.body!.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > 1_000_000) {
      await reader.cancel();
      throw new Error("Employer form exceeds size limit.");
    }
    chunks.push(part.value);
  }
  const form = formSchema.parse(JSON.parse(Buffer.concat(chunks).toString()));
  if (String(form.id) !== jobId)
    throw new Error("Employer form does not match this job.");
  return {
    provider: "greenhouse",
    board,
    externalId: jobId,
    title: plain(form.title),
    questions: [
      ...form.questions,
      ...form.location_questions,
      ...form.compliance,
    ].map((q) => ({ ...q, label: plain(q.label) })),
    dataCompliance: form.data_compliance,
    demographicQuestions: form.demographic_questions || null,
    fetchedAt: new Date().toISOString(),
    notice:
      "Review aid only. File uploads, consent, location and demographic questions may require additional employer-portal steps. No application is submitted.",
  };
}
