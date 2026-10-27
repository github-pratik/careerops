import { beforeAll, afterAll, describe, it, expect } from "vitest";
import EmbeddedPostgres from "embedded-postgres";
import { mkdtemp, readFile, writeFile, unlink } from "node:fs/promises";
import { createDb, migrate, type Db } from "../server/db.js";
import { createApp } from "../server/app.js";
import { packetHash, fileKind } from "../server/domain.js";
import { extractDocument, startWorker } from "../server/worker.js";
import type { Config } from "../server/config.js";
let postgres: EmbeddedPostgres,
  db: Db,
  app: Awaited<ReturnType<typeof createApp>>,
  cfg: Config,
  session: string;
const queued: any[] = [];
const headers = () => ({
  "x-careerops-request": "1",
  cookie: session,
  origin: cfg.origin,
});
async function request(method: any, url: string, payload?: any) {
  return app.inject({ method, url: "/api" + url, headers: headers(), payload });
}
beforeAll(async () => {
  const dir = await mkdtemp("/tmp/careerops-test-");
  postgres = new EmbeddedPostgres({
    databaseDir: dir + "/db",
    port: 15439,
    user: "postgres",
    password: "test-only-password",
    persistent: true,
    onLog: () => {},
    onError: () => {},
    postgresFlags: ["-h", "127.0.0.1", "-k", dir],
  });
  await postgres.initialise();
  await postgres.start();
  cfg = {
    databaseUrl:
      "postgres://postgres:test-only-password@127.0.0.1:15439/postgres",
    dataDir: dir + "/files",
    adminPassword: "test-owner-password-long",
    sessionSecret: "test-session-secret-with-over-32-characters",
    origin: "http://localhost:3100",
    port: 3100,
    secureCookies: false,
  };
  db = createDb(cfg.databaseUrl);
  await migrate(db);
  app = await createApp(db, cfg, {
    send: async (name, data) => {
      queued.push({ name, data });
    },
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/login",
    headers: { "x-careerops-request": "1" },
    payload: { password: cfg.adminPassword },
  });
  expect(login.statusCode).toBe(200);
  session = login.cookies[0].name + "=" + login.cookies[0].value;
});
afterAll(async () => {
  await app?.close();
  await db?.end();
  await postgres?.stop();
});
describe("owner boundary", () => {
  it("serves a newly built asset without restarting the server", async () => {
    const filename = "runtime-asset-test.js";
    await writeFile("dist/" + filename, "export const rebuilt = true;");
    try {
      const response = await app.inject("/" + filename);
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("javascript");
      expect(response.body).toContain("rebuilt = true");
    } finally {
      await unlink("dist/" + filename);
    }
  });
  it("requires authentication for records and artifacts", async () => {
    expect((await app.inject("/api/state")).statusCode).toBe(401);
    expect(
      (
        await app.inject(
          "/api/documents/00000000-0000-4000-8000-000000000000/download",
        )
      ).statusCode,
    ).toBe(401);
  });
  it("rejects cross-origin writes", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/settings/pause",
      headers: { ...headers(), origin: "https://untrusted.example" },
      payload: { paused: false },
    });
    expect(r.statusCode).toBe(403);
  });
  it("never reports disconnected capabilities as working", async () => {
    const r = await request("GET", "/state");
    expect(r.json().capabilities.automaticSubmission).toBe(false);
    expect(r.json().capabilities.emailConnected).toBe(false);
  });
});
describe("document library", () => {
  async function upload(name: string, text: string) {
    const boundary = "co-test-boundary";
    return app.inject({
      method: "POST",
      url: "/api/documents",
      headers: {
        ...headers(),
        "content-type": "multipart/form-data; boundary=" + boundary,
      },
      payload: Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: text/plain\r\n\r\n${text}\r\n--${boundary}--\r\n`,
      ),
    });
  }
  it("retains originals and deduplicates content across filenames/devices", async () => {
    const text =
      "Test candidate. Built a document search project using Python.";
    const first = await upload("resume.txt", text),
      second = await upload("personal-computer.txt", text);
    expect(first.statusCode).toBe(200);
    expect(second.json().duplicate).toBe(true);
    expect(second.json().id).toBe(first.json().id);
    const id = first.json().id;
    expect((await readFile(cfg.dataDir + "/" + id)).toString()).toBe(text);
    await extractDocument(db, cfg, id);
    const {
      rows: [doc],
    } = await db.query("SELECT * FROM co_documents WHERE id=$1", [id]);
    expect(doc.state).toBe("ready");
    expect(doc.content).toBe(text);
    expect(
      (await upload("resume.txt", text + " Additional project.")).json().id,
    ).not.toBe(id);
  });
  it("rejects disguised file types and fake evidence", async () => {
    expect(
      (await upload("resume.pdf", "not a valid pdf document")).statusCode,
    ).toBe(400);
    const {
      rows: [doc],
    } = await db.query(
      "SELECT id FROM co_documents WHERE state='ready' LIMIT 1",
    );
    const r = await request("POST", "/facts", {
      category: "experience",
      label: "False metric",
      value: "Improved speed 100x",
      documentId: doc.id,
      quote: "this quote does not exist",
      confirmed: true,
    });
    expect(r.statusCode).toBe(400);
  });
});
describe("approval integrity", () => {
  let factId: string, jobId: string, packet: any;
  it("requires explicit fact confirmation", async () => {
    expect(
      (
        await request("POST", "/facts", {
          category: "skill",
          label: "Python",
          value: "Python",
        })
      ).statusCode,
    ).toBe(400);
  });
  it("creates a reviewable packet from selected current facts", async () => {
    factId = (
      await request("POST", "/facts", {
        category: "project",
        label: "Search project",
        value: "Built a document search project using Python.",
        confirmed: true,
      })
    ).json().id;
    jobId = (
      await request("POST", "/jobs", {
        company: "Test Company",
        title: "Software Engineer",
        location: "Remote, location must be confirmed",
        url: "https://example.com/jobs/123",
        description:
          "Build software applications with Python and collaborate with the engineering team.",
      })
    ).json().id;
    packet = (
      await request("POST", `/jobs/${jobId}/packets`, {
        factIds: [factId],
        answers: [],
        note: "",
      })
    ).json();
    expect(packet.hash).toHaveLength(64);
    const preview = await request("GET", `/packets/${packet.id}/resume`);
    expect(preview.body).toContain("Built a document search project");
  });
  it("rejects stale hashes and records repeated approval only once", async () => {
    expect(
      (
        await request("POST", `/packets/${packet.id}/approve`, {
          hash: "a".repeat(64),
        })
      ).statusCode,
    ).toBe(409);
    const first = await request("POST", `/packets/${packet.id}/approve`, {
      hash: packet.hash,
    });
    expect(first.json().submitted).toBe(false);
    const second = await request("POST", `/packets/${packet.id}/approve`, {
      hash: packet.hash,
    });
    expect(second.statusCode).toBe(200);
    const {
      rows: [count],
    } = await db.query(
      "SELECT count(*)::int AS n FROM co_audit WHERE action='packet_approved' AND entity_id=$1",
      [packet.id],
    );
    expect(count.n).toBe(1);
  });
  it("invalidates unsent approvals when a fact is retired", async () => {
    await request("DELETE", "/facts/" + factId);
    expect(
      (
        await request("POST", `/packets/${packet.id}/approve`, {
          hash: packet.hash,
        })
      ).statusCode,
    ).toBe(409);
    const {
      rows: [p],
    } = await db.query("SELECT * FROM co_packets WHERE id=$1", [packet.id]);
    expect(p.state).toBe("stale");
    expect(p.payload.facts[0].value).toContain("Python");
  });
});
describe("queue and utilities", () => {
  it("starts the real PostgreSQL queue, persists schedules and stops cleanly", async () => {
    const worker = await startWorker(db, cfg);
    const id = await worker.send("extract-document", {
      id: "00000000-0000-4000-8000-000000000000",
    });
    expect(id).toBeTruthy();
    await worker.stop();
  });
  it("hashes object keys consistently and rejects null-byte text", () => {
    expect(packetHash({ a: 1, b: 2 })).toBe(packetHash({ b: 2, a: 1 }));
    expect(() => fileKind("x.txt", Buffer.from([0]))).toThrow();
  });
});
