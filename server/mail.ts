import { z } from "zod";
import { randomUUID } from "node:crypto";
import { packetHash } from "./domain.js";
import { transaction, type Db } from "./db.js";
export const mailSchema = z.object({
  from: z
    .email()
    .max(254)
    .refine((v) => !/[\r\n]/.test(v)),
  to: z
    .email()
    .max(254)
    .refine((v) => !/[\r\n]/.test(v)),
  subject: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((v) => !/[\r\n]/.test(v)),
  body: z.string().trim().min(1).max(20000),
});
export const mailConfigured = () =>
  Boolean(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN &&
    process.env.GMAIL_ADDRESS &&
    process.env.ALLOW_GMAIL === "true",
  );
async function json(response: Response) {
  if (!response.ok)
    throw new Error(
      `Google mail request failed (${response.status}). Reconnect or check provider limits.`,
    );
  return response.json();
}
async function session() {
  if (!mailConfigured())
    throw new Error(
      "Configure and explicitly enable the dedicated Gmail account first.",
    );
  const token = z.object({ access_token: z.string().min(1) }).parse(
    await json(
      await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GMAIL_CLIENT_ID!,
          client_secret: process.env.GMAIL_CLIENT_SECRET!,
          refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
          grant_type: "refresh_token",
        }),
      }),
    ),
  );
  const headers = { authorization: `Bearer ${token.access_token}` };
  const profile = z
    .object({ emailAddress: z.email() })
    .parse(
      await json(
        await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
          headers,
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        }),
      ),
    );
  if (
    profile.emailAddress.toLowerCase() !==
    process.env.GMAIL_ADDRESS!.toLowerCase()
  )
    throw new Error(
      "The authorized Gmail account does not match the configured dedicated address.",
    );
  return { headers, address: profile.emailAddress };
}
export function messageRaw(input: z.infer<typeof mailSchema>, id: string) {
  const mail = mailSchema.parse(input);
  const body =
    Buffer.from(mail.body)
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") || "";
  return Buffer.from(
    [
      `From: ${mail.from}`,
      `To: ${mail.to}`,
      `Subject: =?UTF-8?B?${Buffer.from(mail.subject).toString("base64")}?=`,
      `Message-ID: <careerops-${id}@${mail.from.split("@")[1]}>`,
      `Date: ${new Date().toUTCString()}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      body,
    ].join("\r\n"),
  ).toString("base64url");
}
export async function syncInbox(db: Db) {
  const s = await session();
  const {
    rows: [linked],
  } = await db.query("SELECT address FROM co_mail_state");
  if (linked && linked.address.toLowerCase() !== s.address.toLowerCase())
    throw new Error(
      "This workspace is linked to another mailbox. Use a separate workspace for a different account.",
    );
  const listing = z
    .object({
      messages: z
        .array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]+$/) }))
        .max(50)
        .default([]),
    })
    .parse(
      await json(
        await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=50",
          {
            headers: s.headers,
            redirect: "error",
            signal: AbortSignal.timeout(15000),
          },
        ),
      ),
    );
  for (const message of listing.messages) {
    const item = z
      .object({
        id: z.string(),
        threadId: z.string(),
        snippet: z.string().max(5000).default(""),
        internalDate: z.string(),
        payload: z.object({
          headers: z.array(z.object({ name: z.string(), value: z.string() })),
        }),
      })
      .parse(
        await json(
          await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
            {
              headers: s.headers,
              redirect: "error",
              signal: AbortSignal.timeout(15000),
            },
          ),
        ),
      );
    const header = (name: string) =>
      item.payload.headers
        .find((h) => h.name.toLowerCase() === name)
        ?.value.slice(0, 2000) || "";
    const receivedAt = new Date(Number(item.internalDate));
    if (!Number.isFinite(receivedAt.getTime()) || item.id !== message.id)
      throw new Error("Mail provider returned invalid message metadata.");
    await db.query(
      "INSERT INTO co_mail_messages(id,thread_id,sender,subject,snippet,received_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET snippet=excluded.snippet",
      [
        item.id,
        item.threadId,
        header("from"),
        header("subject"),
        item.snippet,
        receivedAt,
      ],
    );
  }
  await db.query(
    "INSERT INTO co_mail_state(id,address,verified_at) VALUES(true,$1,now()) ON CONFLICT(id) DO UPDATE SET address=excluded.address,verified_at=now()",
    [s.address],
  );
  return { count: listing.messages.length, limit: 50 };
}
export async function sendDraft(db: Db, id: string, hash: string) {
  const {
    rows: [existing],
  } = await db.query("SELECT * FROM co_mail_drafts WHERE id=$1", [id]);
  if (!existing) throw new Error("Mail draft not found.");
  if (existing.hash !== hash || packetHash(existing.payload) !== hash)
    throw new Error("Draft hash does not match the reviewed message.");
  if (existing.state === "sent") return { sent: true, duplicate: true };
  if (existing.state !== "draft")
    throw new Error(
      "This message has already been attempted. Reconcile its delivery before doing anything else.",
    );
  const s = await session();
  if (existing.payload.from.toLowerCase() !== s.address.toLowerCase())
    throw new Error(
      "The reviewed sender does not match the authorized account. Create a fresh draft.",
    );
  await transaction(db, async (c) => {
    await c.query("SELECT * FROM co_settings FOR UPDATE");
    const {
      rows: [usage],
    } = await c.query(
      "SELECT count(*)::int AS n FROM co_mail_drafts WHERE attempted_at>now()-interval '24 hours'",
    );
    if (usage.n >= 3)
      throw new Error("Daily mail limit reached (3 attempts per 24 hours).");
    const result = await c.query(
      "UPDATE co_mail_drafts SET state='sending',attempted_at=now() WHERE id=$1 AND state='draft' RETURNING id",
      [id],
    );
    if (!result.rowCount) throw new Error("Message already attempted.");
    await c.query(
      "INSERT INTO co_audit(action,entity_id,detail) VALUES('mail_send_authorized',$1,$2)",
      [id, { hash }],
    );
  });
  try {
    const result = z
      .object({ id: z.string().min(1), threadId: z.string().optional() })
      .parse(
        await json(
          await fetch(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            {
              method: "POST",
              headers: { ...s.headers, "content-type": "application/json" },
              redirect: "error",
              signal: AbortSignal.timeout(20000),
              body: JSON.stringify({ raw: messageRaw(existing.payload, id) }),
            },
          ),
        ),
      );
    await db.query(
      "UPDATE co_mail_drafts SET state='sent',provider_id=$2 WHERE id=$1",
      [id, result.id],
    );
    await db.query(
      "INSERT INTO co_audit(action,entity_id) VALUES('mail_provider_accepted',$1)",
      [id],
    );
    return { sent: true, providerId: result.id };
  } catch {
    await db.query("UPDATE co_mail_drafts SET state='unknown' WHERE id=$1", [
      id,
    ]);
    throw new Error(
      "Delivery outcome is unknown. Check Sent mail before reconciling; this message will not be retried automatically.",
    );
  }
}
export async function saveDraft(db: Db, input: unknown) {
  const payload = mailSchema.parse(input),
    id = randomUUID(),
    hash = packetHash(payload);
  await db.query(
    "INSERT INTO co_mail_drafts(id,payload,hash) VALUES($1,$2,$3)",
    [id, payload, hash],
  );
  return { id, hash };
}
