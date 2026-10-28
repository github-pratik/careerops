import { createHash } from "node:crypto";
import { z } from "zod";
export const idSchema = z.string().uuid();
export const factSchema = z.object({
  category: z.enum([
    "identity",
    "summary",
    "experience",
    "project",
    "education",
    "skill",
    "authorization",
  ]),
  label: z.string().trim().min(1).max(150),
  value: z.string().trim().min(1).max(3000),
  documentId: z.string().uuid().nullable().optional(),
  quote: z.string().max(3000).nullable().optional(),
  confirmed: z.literal(true),
});
export const jobSchema = z.object({
  company: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  location: z.string().trim().min(1).max(200),
  url: z
    .string()
    .url()
    .max(2000)
    .refine(
      (v) => new URL(v).protocol === "https:",
      "Use an HTTPS application URL",
    ),
  description: z.string().trim().min(40).max(60000),
});
export const sourceSchema = z.object({
  provider: z.enum(["greenhouse", "lever", "ashby"]),
  board: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  company: z.string().trim().min(1).max(200),
});
export const packetSchema = z.object({
  assessmentId: z.string().uuid().optional(),
  factIds: z.array(z.string().uuid()).min(1).max(100),
  note: z.string().max(3000).default(""),
  answers: z
    .array(
      z.object({
        question: z.string().min(1).max(500),
        answer: z.string().min(1).max(3000),
      }),
    )
    .max(60)
    .default([]),
});
export function digest(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}
export const preferencesSchema = z.object({
  monthlyBudgetUsd: z.number().min(0).max(10),
  usualNetMonthlyUsd: z.number().min(0).max(1000000).nullable(),
  indiaRemoteFlexible: z.boolean(),
  markets: z.array(z.string().trim().min(1).max(100)).max(20),
  targetRoles: z.array(z.string().trim().min(1).max(100)).max(15).default([]),
});
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonical((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function packetHash(value: unknown) {
  return digest(canonical(value));
}
export function fileKind(
  filename: string,
  buffer: Buffer,
): "pdf" | "docx" | "txt" {
  const ext = filename.toLowerCase().split(".").at(-1);
  if (ext === "pdf" && buffer.subarray(0, 5).toString() === "%PDF-")
    return "pdf";
  if (
    ext === "docx" &&
    buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4]))
  )
    return "docx";
  if (ext === "txt" && !buffer.includes(0)) return "txt";
  throw new Error("Upload a valid PDF, DOCX or UTF-8 text file.");
}
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function resumeHtml(payload: any) {
  const facts = payload.facts.filter(
    (f: any) => f.category !== "authorization",
  );
  const groups = [
    "identity",
    "summary",
    "experience",
    "project",
    "education",
    "skill",
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><title>Resume</title><style>@page{size:A4;margin:18mm}body{font:11pt/1.5 Arial,sans-serif;color:#182721;max-width:760px;margin:35px auto}h1{font-size:21pt}h2{font-size:12pt;border-bottom:1px solid #aebbb4;margin-top:22px;text-transform:uppercase}section{break-inside:avoid}p{white-space:pre-wrap;margin:5px 0 12px}small{color:#65766e}@media print{body{margin:0}button,small{display:none}}</style></head><body>${groups
    .map((g) => {
      const rows = facts.filter((f: any) => f.category === g);
      return rows.length
        ? `<h2>${g === "identity" ? "Profile" : g}</h2>` +
            rows
              .map(
                (f: any) =>
                  `<section><strong>${escapeHtml(f.label)}</strong><p>${escapeHtml(f.value)}</p></section>`,
              )
              .join("")
        : "";
    })
    .join(
      "",
    )}<small>Prepared from your confirmed profile. Review layout before sending.</small></body></html>`;
}
