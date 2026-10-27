import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Config } from "./config.js";
import { transaction, type Db } from "./db.js";
import type { Queue } from "./worker.js";
import {
  digest,
  factSchema,
  fileKind,
  idSchema,
  jobSchema,
  packetHash,
  packetSchema,
  resumeHtml,
  sourceSchema,
} from "./domain.js";
import { analyzeDocument, modelReady } from "./models.js";

const fail = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { statusCode });
export async function createApp(db: Db, cfg: Config, queue: Queue) {
  const app = Fastify({
    logger:
      process.env.NODE_ENV === "test"
        ? false
        : {
            redact: [
              "req.headers.cookie",
              "req.headers.authorization",
              "req.body",
            ],
          },
    bodyLimit: 250000,
  });
  await mkdir(cfg.dataDir, { recursive: true, mode: 0o700 });
  await app.register(cookie, { secret: cfg.sessionSecret });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 3 },
  });
  const sign = (value: string) =>
    createHmac("sha256", cfg.sessionSecret).update(value).digest();
  const validSession = (req: any) => {
    const raw = req.cookies.session;
    if (!raw) return false;
    const unsigned = req.unsignCookie(raw);
    if (!unsigned.valid) return false;
    return (
      /^\d+$/.test(unsigned.value) &&
      Number(unsigned.value) > Date.now() &&
      Number(unsigned.value) < Date.now() + 86400001
    );
  };
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("X-Frame-Options", "DENY");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    const route = req.routeOptions.url ?? req.url.split("?")[0];
    if (route.startsWith("/api/")) {
      reply.header("Cache-Control", "no-store");
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        if (
          req.headers["x-careerops-request"] !== "1" ||
          (req.headers.origin && req.headers.origin !== cfg.origin)
        )
          throw fail(403, "Request origin could not be verified.");
      }
      const publicPath = ["/api/login", "/api/session", "/api/health"].includes(
        route,
      );
      if (!publicPath && !validSession(req)) throw fail(401, "Please sign in.");
    }
  });
  app.setErrorHandler((error: any, _req, reply) => {
    if (error instanceof z.ZodError)
      return reply
        .code(400)
        .send({ error: error.issues.map((i) => i.message).join("; ") });
    const code = error.statusCode || (error.code === "23505" ? 409 : 500);
    if (code >= 500)
      app.log.error({ message: error.message }, "Request failed");
    reply
      .code(code)
      .send({
        error:
          code >= 500
            ? "Operation failed. Please retry; your existing records are retained."
            : error.message,
      });
  });
  app.get("/api/health", async () => {
    await db.query("SELECT 1");
    return { ok: true };
  });
  app.get("/api/session", async (req) => ({
    authenticated: validSession(req),
  }));
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { password } = z
        .object({ password: z.string().max(200) })
        .parse(req.body);
      if (!timingSafeEqual(sign(password), sign(cfg.adminPassword)))
        throw fail(401, "Incorrect password.");
      reply.setCookie("session", String(Date.now() + 86400000), {
        signed: true,
        httpOnly: true,
        secure: cfg.secureCookies,
        sameSite: "strict",
        path: "/",
        maxAge: 86400,
      });
      return { ok: true };
    },
  );
  app.post("/api/logout", async (_req, reply) => {
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  });
  app.get("/api/state", async () => {
    const [
      documents,
      facts,
      jobs,
      packets,
      sources,
      settings,
      audit,
      proposals,
      usage,
    ] = await Promise.all([
      db.query(
        "SELECT d.*, (SELECT count(*)::int FROM co_imports i WHERE i.document_id=d.id) AS imports FROM co_documents d ORDER BY created_at DESC",
      ),
      db.query("SELECT * FROM co_facts WHERE active ORDER BY confirmed_at"),
      db.query("SELECT * FROM co_jobs ORDER BY created_at DESC LIMIT 500"),
      db.query(
        "SELECT p.*,j.title,j.company FROM co_packets p JOIN co_jobs j ON j.id=p.job_id ORDER BY p.created_at DESC LIMIT 200",
      ),
      db.query("SELECT * FROM co_sources ORDER BY company"),
      db.query("SELECT * FROM co_settings"),
      db.query("SELECT * FROM co_audit ORDER BY id DESC LIMIT 100"),
      db.query(
        "SELECT p.*,d.filename FROM co_proposals p JOIN co_documents d ON d.id=p.document_id WHERE p.state='proposed' ORDER BY p.created_at",
      ),
      db.query(
        "SELECT coalesce(sum(coalesce(cost_usd,reserved_usd)),0)::float AS estimated_usd FROM co_model_calls WHERE created_at>=date_trunc('month',now())",
      ),
    ]);
    return {
      documents: documents.rows,
      facts: facts.rows,
      jobs: jobs.rows,
      packets: packets.rows,
      sources: sources.rows,
      settings: settings.rows[0],
      audit: audit.rows,
      proposals: proposals.rows,
      modelUsage: usage.rows[0],
      capabilities: {
        documentLibrary: true,
        sourceScanning: true,
        profileReview: true,
        packetApproval: true,
        automaticSubmission: false,
        emailConnected: false,
        aiConnected: modelReady(),
      },
      operatingMode:
        "Review workspace — external submission and email are not connected",
    };
  });
  app.post("/api/documents", async (req) => {
    const part = await req.file();
    if (!part) throw fail(400, "Choose a document.");
    const buffer = await part.toBuffer();
    if (part.file.truncated) throw fail(413, "File exceeds 10 MB.");
    let kind: string;
    try {
      kind = fileKind(part.filename, buffer);
    } catch (e) {
      throw fail(400, (e as Error).message);
    }
    const hash = digest(buffer),
      id = randomUUID();
    const filename = path.basename(part.filename).slice(0, 200);
    await writeFile(path.join(cfg.dataDir, id), buffer, {
      mode: 0o600,
      flag: "wx",
    });
    let storedId: string;
    try {
      storedId = await transaction(db, async (c) => {
        const { rows } = await c.query(
          "INSERT INTO co_documents(id,hash,filename,kind,bytes) VALUES($1,$2,$3,$4,$5) ON CONFLICT(hash) DO UPDATE SET hash=excluded.hash RETURNING id",
          [id, hash, filename, kind, buffer.length],
        );
        const docId = rows[0].id;
        await c.query(
          "INSERT INTO co_imports(document_id,filename,source) VALUES($1,$2,$3)",
          [docId, filename, "Browser upload"],
        );
        await c.query("INSERT INTO co_audit(action,entity_id) VALUES($1,$2)", [
          "document_imported",
          docId,
        ]);
        return docId;
      });
    } catch (e) {
      await unlink(path.join(cfg.dataDir, id));
      throw e;
    }
    if (storedId !== id) await unlink(path.join(cfg.dataDir, id));
    // Startup reconciliation recovers a committed upload if enqueueing is interrupted.
    try {
      await queue.send("extract-document", { id: storedId });
    } catch {
      app.log.warn(
        "Document retained; extraction will be recovered on worker restart.",
      );
    }
    return { id: storedId, duplicate: storedId !== id };
  });
  app.get("/api/documents/:id/download", async (req, reply) => {
    const id = idSchema.parse((req.params as any).id);
    const {
      rows: [doc],
    } = await db.query("SELECT * FROM co_documents WHERE id=$1", [id]);
    if (!doc) throw fail(404, "Document not found.");
    reply
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      )
      .type("application/octet-stream");
    return readFile(path.join(cfg.dataDir, id));
  });
  app.post("/api/documents/:id/retry", async (req) => {
    const id = idSchema.parse((req.params as any).id);
    const r = await db.query(
      "UPDATE co_documents SET state='queued',error=NULL WHERE id=$1 AND state='needs_attention' RETURNING id",
      [id],
    );
    if (!r.rowCount)
      throw fail(409, "This document is not awaiting extraction retry.");
    await queue.send("extract-document", { id });
    return { ok: true };
  });
  app.post("/api/documents/:id/analyze", async (req) => {
    const id = idSchema.parse((req.params as any).id);
    if (!modelReady())
      throw fail(
        409,
        "AI is not connected. A provider key and personal-data approval are required.",
      );
    try {
      return await analyzeDocument(db, id);
    } catch (e) {
      throw fail(422, (e as Error).message);
    }
  });
  async function invalidate(c: any) {
    await c.query("UPDATE co_settings SET profile_version=profile_version+1");
    await c.query(
      "UPDATE co_packets SET state='stale' WHERE state IN ('review','approved')",
    );
  }
  app.post("/api/proposals/:id/confirm", async (req) => {
    const id = idSchema.parse((req.params as any).id);
    const { confirmed } = z
      .object({ confirmed: z.literal(true) })
      .parse(req.body);
    await transaction(db, async (c) => {
      await c.query("SELECT * FROM co_settings FOR UPDATE");
      const {
        rows: [p],
      } = await c.query(
        "SELECT * FROM co_proposals WHERE id=$1 AND state='proposed' FOR UPDATE",
        [id],
      );
      if (!p) throw fail(409, "Proposal is no longer pending.");
      const {
        rows: [conflict],
      } = await c.query(
        "SELECT id FROM co_facts WHERE active AND category=$1 AND lower(label)=lower($2) AND value<>$3",
        [p.category, p.label, p.value],
      );
      if (conflict)
        throw fail(
          409,
          "A different confirmed fact uses this label. Review and retire the old fact, or add the corrected fact explicitly.",
        );
      const {
        rows: [existing],
      } = await c.query(
        "SELECT id FROM co_facts WHERE active AND category=$1 AND lower(label)=lower($2) AND value=$3",
        [p.category, p.label, p.value],
      );
      if (!existing) {
        await c.query(
          "INSERT INTO co_facts(id,category,label,value,document_id,quote) VALUES($1,$2,$3,$4,$5,$6)",
          [randomUUID(), p.category, p.label, p.value, p.document_id, p.quote],
        );
        await invalidate(c);
      }
      await c.query("UPDATE co_proposals SET state='confirmed' WHERE id=$1", [
        id,
      ]);
      await c.query(
        "INSERT INTO co_audit(action,entity_id,detail) VALUES($1,$2,$3)",
        ["proposal_confirmed", id, { confirmed }],
      );
    });
    return { ok: true };
  });
  app.post("/api/proposals/:id/dismiss", async (req) => {
    const id = idSchema.parse((req.params as any).id);
    await db.query(
      "UPDATE co_proposals SET state='dismissed' WHERE id=$1 AND state='proposed'",
      [id],
    );
    return { ok: true };
  });
  app.post("/api/facts", async (req) => {
    const input = factSchema.parse(req.body);
    const id = randomUUID();
    await transaction(db, async (c) => {
      await c.query("SELECT * FROM co_settings FOR UPDATE");
      if (input.documentId) {
        const {
          rows: [doc],
        } = await c.query(
          "SELECT content FROM co_documents WHERE id=$1 AND state=$2",
          [input.documentId, "ready"],
        );
        if (!doc || !input.quote || !doc.content.includes(input.quote))
          throw fail(
            400,
            "Evidence quote must appear exactly in a ready source document.",
          );
      }
      await c.query(
        "INSERT INTO co_facts(id,category,label,value,document_id,quote) VALUES($1,$2,$3,$4,$5,$6)",
        [
          id,
          input.category,
          input.label,
          input.value,
          input.documentId || null,
          input.quote || null,
        ],
      );
      await invalidate(c);
      await c.query("INSERT INTO co_audit(action,entity_id) VALUES($1,$2)", [
        "fact_confirmed",
        id,
      ]);
    });
    return { id };
  });
  app.delete("/api/facts/:id", async (req) => {
    const id = idSchema.parse((req.params as any).id);
    await transaction(db, async (c) => {
      await c.query("SELECT * FROM co_settings FOR UPDATE");
      const r = await c.query(
        "UPDATE co_facts SET active=false WHERE id=$1 AND active RETURNING id",
        [id],
      );
      if (!r.rowCount) throw fail(404, "Fact not found.");
      await invalidate(c);
      await c.query("INSERT INTO co_audit(action,entity_id) VALUES($1,$2)", [
        "fact_retired",
        id,
      ]);
    });
    return { ok: true };
  });
  app.post("/api/jobs", async (req) => {
    const j = jobSchema.parse(req.body),
      id = randomUUID();
    const {
      rows: [existing],
    } = await db.query("SELECT id FROM co_jobs WHERE url=$1", [j.url]);
    if (existing) return { id: existing.id, duplicate: true };
    await db.query(
      "INSERT INTO co_jobs(id,company,title,location,url,description) VALUES($1,$2,$3,$4,$5,$6)",
      [id, j.company, j.title, j.location, j.url, j.description],
    );
    return { id };
  });
  app.post("/api/sources", async (req) => {
    const s = sourceSchema.parse(req.body),
      id = randomUUID();
    await db.query(
      "INSERT INTO co_sources(id,provider,board,company) VALUES($1,$2,$3,$4)",
      [id, s.provider, s.board, s.company],
    );
    await queue.send("scan-source", { id });
    return { id };
  });
  app.post("/api/sources/:id/scan", async (req) => {
    const id = idSchema.parse((req.params as any).id);
    const r = await db.query("SELECT id FROM co_sources WHERE id=$1", [id]);
    if (!r.rowCount) throw fail(404, "Source not found.");
    await queue.send("scan-source", { id });
    return { ok: true };
  });
  app.post("/api/jobs/:id/packets", async (req) => {
    const jobId = idSchema.parse((req.params as any).id),
      input = packetSchema.parse(req.body),
      id = randomUUID();
    return transaction(db, async (c) => {
      const {
        rows: [settings],
      } = await c.query("SELECT * FROM co_settings FOR UPDATE");
      const {
        rows: [job],
      } = await c.query("SELECT * FROM co_jobs WHERE id=$1", [jobId]);
      if (!job) throw fail(404, "Job not found.");
      const { rows: facts } = await c.query(
        "SELECT id,category,label,value,version FROM co_facts WHERE active AND id=ANY($1::uuid[]) ORDER BY category,label",
        [input.factIds],
      );
      if (facts.length !== new Set(input.factIds).size)
        throw fail(409, "One or more selected facts are no longer current.");
      const payload = {
        job: {
          id: job.id,
          title: job.title,
          company: job.company,
          url: job.url,
          description: job.description,
          location: job.location,
        },
        facts,
        note: input.note,
        answers: input.answers,
        preferences: settings.preferences,
      };
      const hash = packetHash(payload);
      await c.query(
        "INSERT INTO co_packets(id,job_id,profile_version,payload,hash) VALUES($1,$2,$3,$4,$5)",
        [id, jobId, settings.profile_version, payload, hash],
      );
      await c.query("INSERT INTO co_audit(action,entity_id) VALUES($1,$2)", [
        "packet_created",
        id,
      ]);
      return { id, hash };
    });
  });
  app.post("/api/packets/:id/approve", async (req) => {
    const id = idSchema.parse((req.params as any).id);
    const { hash } = z.object({ hash: z.string().length(64) }).parse(req.body);
    await transaction(db, async (c) => {
      const {
        rows: [settings],
      } = await c.query("SELECT * FROM co_settings FOR UPDATE");
      const {
        rows: [packet],
      } = await c.query("SELECT * FROM co_packets WHERE id=$1 FOR UPDATE", [
        id,
      ]);
      if (!packet) throw fail(404, "Packet not found.");
      const {
        rows: [job],
      } = await c.query("SELECT * FROM co_jobs WHERE id=$1", [packet.job_id]);
      if (
        packet.state === "stale" ||
        packet.profile_version !== settings.profile_version ||
        packet.hash !== hash ||
        packetHash(packet.payload) !== hash ||
        job.description !== packet.payload.job.description ||
        job.url !== packet.payload.job.url
      )
        throw fail(
          409,
          "This packet has changed. Create and review a fresh packet.",
        );
      if (packet.state === "approved") return;
      if (packet.state !== "review")
        throw fail(409, "Packet cannot be approved in its current state.");
      await c.query(
        "UPDATE co_packets SET state='approved',approved_at=now() WHERE id=$1",
        [id],
      );
      await c.query(
        "INSERT INTO co_audit(action,entity_id,detail) VALUES($1,$2,$3)",
        ["packet_approved", id, { hash }],
      );
    });
    return {
      ok: true,
      submitted: false,
      message:
        "Approved and retained. Automatic submission is not yet connected.",
    };
  });
  app.get("/api/packets/:id/resume", async (req, reply) => {
    const id = idSchema.parse((req.params as any).id);
    const {
      rows: [p],
    } = await db.query("SELECT payload FROM co_packets WHERE id=$1", [id]);
    if (!p) throw fail(404, "Packet not found.");
    return reply.type("text/html").send(resumeHtml(p.payload));
  });
  app.post("/api/settings/pause", async (req) => {
    const { paused } = z.object({ paused: z.boolean() }).parse(req.body);
    await db.query("UPDATE co_settings SET paused=$1", [paused]);
    return { ok: true };
  });
  await app.register(staticFiles, {
    root: path.resolve("dist"),
    wildcard: true,
  });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith("/api/")
      ? reply.code(404).send({ error: "Not found" })
      : reply.sendFile("index.html"),
  );
  return app;
}
