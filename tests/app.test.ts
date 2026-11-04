import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import EmbeddedPostgres from "embedded-postgres";
import { mkdtemp, readFile, writeFile, unlink } from "node:fs/promises";
import { createDb, migrate, type Db } from "../server/db.js";
import { createApp } from "../server/app.js";
import { randomUUID } from "node:crypto";
import { packetHash, fileKind } from "../server/domain.js";
import { extractDocument, scanSource, startWorker } from "../server/worker.js";
import {
  backupWorkspace,
  restoreWorkspace,
  decryptSnapshot,
} from "../server/backup.js";
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
describe("job matching and preparation", () => {
  let factId: string, jobId: string, assessmentId: string;
  const description = "Build services using Python. Kubernetes is preferred.";
  const makeOutput = () => ({
    score: 79,
    summary: "Relevant Python project; deployment experience is unknown.",
    matches: [
      {
        requirementQuote: "Python",
        factId,
        reason: "Confirmed Python project.",
      },
    ],
    gaps: [
      {
        requirementQuote: "Kubernetes",
        reason: "Not established by the profile.",
      },
    ],
    recommendedFactIds: [factId],
    warnings: ["Confirm remote geography and work eligibility."],
  });
  function enableModel(output: unknown = makeOutput()) {
    vi.stubEnv("GROQ_API_KEY", "synthetic-test-key");
    vi.stubEnv("ALLOW_PERSONAL_DATA_TO_GROQ", "true");
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(output) } }],
          usage: { prompt_tokens: 1000, completion_tokens: 300 },
        }),
        { status: 200 },
      ),
    );
  }
  beforeAll(async () => {
    factId = (
      await request("POST", "/facts", {
        category: "project",
        label: "Matching fixture project",
        value: "Built services using Python.",
        confirmed: true,
      })
    ).json().id;
    await request("POST", "/facts", {
      category: "identity",
      label: "Private fixture identity",
      value: "Fixture contact excluded from matching",
      confirmed: true,
    });
    await request("POST", "/facts", {
      category: "authorization",
      label: "Private fixture authorization",
      value: "Fixture authorization excluded from matching",
      confirmed: true,
    });
    jobId = (
      await request("POST", "/jobs", {
        company: "Matching Fixture",
        title: "Software Engineer",
        location: "Remote, countries unverified",
        url: "https://example.com/matching-fixture",
        description,
      })
    ).json().id;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  it("requires a connected, consented provider", async () => {
    const r = await request("POST", `/jobs/${jobId}/assess`, {});
    expect(r.statusCode).toBe(409);
  });
  it("sends the full posting, minimizes identity data and caches versioned assessments", async () => {
    const provider = enableModel();
    const first = await request("POST", `/jobs/${jobId}/assess`, {});
    expect(first.statusCode).toBe(200);
    expect(first.json().output.score).toBe(79);
    assessmentId = first.json().id;
    const body = JSON.parse(
      (provider.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.messages[1].content).toContain(description);
    expect(body.messages[1].content).not.toContain("Fixture contact excluded");
    expect(body.messages[1].content).not.toContain(
      "Fixture authorization excluded",
    );
    const second = await request("POST", `/jobs/${jobId}/assess`, {});
    expect(second.json().cached).toBe(true);
    expect(provider).toHaveBeenCalledTimes(1);
    const packet = await request("POST", `/jobs/${jobId}/packets`, {
      factIds: [factId],
      assessmentId,
    });
    expect(packet.statusCode).toBe(200);
    const {
      rows: [saved],
    } = await db.query("SELECT payload FROM co_packets WHERE id=$1", [
      packet.json().id,
    ]);
    expect(saved.payload.facts[0].value).toBe("Built services using Python.");
    expect(saved.payload.assessment.id).toBe(assessmentId);
    await db.query("UPDATE co_jobs SET location=$2 WHERE id=$1", [
      jobId,
      "Onsite, fixture country",
    ]);
    expect(
      (
        await request("POST", `/packets/${packet.json().id}/approve`, {
          hash: packet.json().hash,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request("POST", `/jobs/${jobId}/packets`, {
          factIds: [factId],
          assessmentId,
        })
      ).statusCode,
    ).toBe(409);
  });
  it("shows provider quota failure without creating a rejection score", async () => {
    const provider = enableModel();
    provider.mockResolvedValue(new Response("{}", { status: 429 }));
    const before = await db.query(
      "SELECT count(*)::int AS n FROM co_assessments WHERE job_id=$1",
      [jobId],
    );
    const response = await request("POST", `/jobs/${jobId}/assess`, {});
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toContain("quota");
    const after = await db.query(
      "SELECT count(*)::int AS n FROM co_assessments WHERE job_id=$1",
      [jobId],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
    const {
      rows: [job],
    } = await db.query("SELECT state FROM co_jobs WHERE id=$1", [jobId]);
    expect(job.state).toBe("new");
  });
  it("rejects fabricated fact references and never saves the assessment", async () => {
    const provider = enableModel({
      ...makeOutput(),
      recommendedFactIds: ["33333333-3333-4333-8333-333333333333"],
    });
    const response = await request("POST", `/jobs/${jobId}/assess`, {});
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toContain("unknown");
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it("invalidates stale recommendations after preference changes and honors a zero budget", async () => {
    const provider = enableModel();
    const saved = await request("POST", "/preferences", {
      monthlyBudgetUsd: 0,
      usualNetMonthlyUsd: null,
      indiaRemoteFlexible: true,
      markets: ["Fixture market"],
      targetRoles: ["Software Engineer"],
    });
    expect(saved.statusCode).toBe(200);
    const state = (await request("GET", "/state")).json();
    expect(
      state.assessments.find((a: any) => a.id === assessmentId).stale,
    ).toBe(true);
    const response = await request("POST", `/jobs/${jobId}/assess`, {});
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toContain("allowance");
    expect(provider).not.toHaveBeenCalled();
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

describe("source lifecycle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("closes removed listings, invalidates changed packets, and preserves jobs on feed failure", async () => {
    const source = randomUUID();
    await db.query(
      "INSERT INTO co_sources(id,provider,board,company) VALUES($1,'lever','fixture-board','Fixture Board')",
      [source],
    );
    const posting = {
      id: "fixture-1",
      text: "Engineer",
      hostedUrl: "https://example.com/fixture-source",
      descriptionPlain:
        "Build systems using Python and collaborate with engineers.",
      categories: { location: "Remote" },
    };
    const provider = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify([posting])));
    await scanSource(db, source);
    const {
      rows: [job],
    } = await db.query("SELECT * FROM co_jobs WHERE source_id=$1", [source]);
    const factId = (
      await request("POST", "/facts", {
        category: "skill",
        label: "Source lifecycle Python",
        value: "Python",
        confirmed: true,
      })
    ).json().id;
    const packet = (
      await request("POST", `/jobs/${job.id}/packets`, { factIds: [factId] })
    ).json();
    expect(
      (
        await request("POST", `/packets/${packet.id}/approve`, {
          hash: packet.hash,
        })
      ).statusCode,
    ).toBe(200);
    provider.mockResolvedValue(
      new Response(JSON.stringify([{ ...posting, text: "Senior Engineer" }])),
    );
    await scanSource(db, source);
    expect(
      (await db.query("SELECT state FROM co_packets WHERE id=$1", [packet.id]))
        .rows[0].state,
    ).toBe("stale");
    provider.mockResolvedValue(new Response("{}", { status: 503 }));
    await expect(scanSource(db, source)).rejects.toThrow("503");
    expect(
      (await db.query("SELECT state FROM co_jobs WHERE id=$1", [job.id]))
        .rows[0].state,
    ).toBe("new");
    provider.mockResolvedValue(new Response("[]"));
    await scanSource(db, source);
    expect(
      (await db.query("SELECT state FROM co_jobs WHERE id=$1", [job.id]))
        .rows[0].state,
    ).toBe("closed");
    expect(
      (await request("POST", `/jobs/${job.id}/packets`, { factIds: [factId] }))
        .statusCode,
    ).toBe(409);
    provider.mockResolvedValue(new Response(JSON.stringify([posting])));
    await scanSource(db, source);
    expect(
      (await db.query("SELECT state FROM co_jobs WHERE id=$1", [job.id]))
        .rows[0].state,
    ).toBe("new");
  });
  it("does not retire jobs from a truncated oversized feed", async () => {
    const {
      rows: [source],
    } = await db.query("SELECT id FROM co_sources WHERE board='fixture-board'");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(Array.from({ length: 501 }, (_, i) => ({ id: i }))),
      ),
    );
    await expect(scanSource(db, source.id)).rejects.toThrow("500");
    expect(
      (
        await db.query("SELECT state FROM co_jobs WHERE source_id=$1", [
          source.id,
        ])
      ).rows[0].state,
    ).toBe("new");
  });
});

describe("owner-reported application outcomes", () => {
  it("requires approval and evidence, records once, tracks outcomes and exports exact packets", async () => {
    const fact = (
      await request("POST", "/facts", {
        category: "skill",
        label: "Tracker Python",
        value: "Python",
        confirmed: true,
      })
    ).json();
    const job = (
      await request("POST", "/jobs", {
        company: "Tracker Fixture",
        title: "Engineer",
        location: "Remote",
        url: "https://example.com/tracker",
        description: "Build software using Python and work with the team.",
      })
    ).json();
    const packet = (
      await request("POST", `/jobs/${job.id}/packets`, {
        factIds: [fact.id],
        answers: [
          {
            question: "Why this role?",
            answer: "My confirmed Python experience is relevant.",
          },
        ],
      })
    ).json();
    const body = {
      confirmed: true,
      evidence: "Fixture confirmation reference 123",
      appliedAt: new Date().toISOString(),
    };
    expect(
      (await request("POST", `/packets/${packet.id}/application`, body))
        .statusCode,
    ).toBe(409);
    await request("POST", `/packets/${packet.id}/approve`, {
      hash: packet.hash,
    });
    expect(
      (
        await request("POST", `/packets/${packet.id}/application`, {
          ...body,
          confirmed: false,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request("POST", `/packets/${packet.id}/application`, {
          ...body,
          appliedAt: new Date(Date.now() + 86400000).toISOString(),
        })
      ).statusCode,
    ).toBe(400);
    const first = await request(
      "POST",
      `/packets/${packet.id}/application`,
      body,
    );
    expect(first.statusCode).toBe(200);
    const repeat = await request(
      "POST",
      `/packets/${packet.id}/application`,
      body,
    );
    expect(repeat.json().id).toBe(first.json().id);
    await request("POST", `/applications/${first.json().id}/status`, {
      status: "interview",
      evidence: "Fixture interview invitation received",
    });
    const exported = await request("GET", `/packets/${packet.id}/export`);
    expect(exported.json().hash).toBe(packetHash(exported.json().payload));
    expect(exported.json().payload.answers[0].question).toBe("Why this role?");
    await request("DELETE", `/facts/${fact.id}`);
    const state = (await request("GET", "/state")).json();
    expect(
      state.applications.find((a: any) => a.id === first.json().id).status,
    ).toBe("interview");
    expect(
      (await app.inject(`/api/packets/${packet.id}/export`)).statusCode,
    ).toBe(401);
  });
});

describe("encrypted workspace recovery", () => {
  it("restores originals, provenance and hashes into an empty destination and refuses overwrite", async () => {
    const passphrase = "synthetic-backup-passphrase-123456";
    const encrypted = await backupWorkspace(db, cfg.dataDir, passphrase);
    expect(encrypted.includes(Buffer.from("Tracker Fixture"))).toBe(false);
    expect(() =>
      decryptSnapshot(encrypted, "wrong-long-passphrase-for-test"),
    ).toThrow();
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 1;
    expect(() => decryptSnapshot(tampered, passphrase)).toThrow();
    const snapshot = decryptSnapshot(encrypted, passphrase);
    const restoreName = "restore_" + randomUUID().replaceAll("-", "");
    await db.query(`CREATE DATABASE ${restoreName}`);
    const restoreUrl = new URL(cfg.databaseUrl);
    restoreUrl.pathname = "/" + restoreName;
    const restored = createDb(restoreUrl.toString());
    const dir = await mkdtemp("/tmp/careerops-restore-test-");
    try {
      await migrate(restored);
      const result = await restoreWorkspace(
        restored,
        dir + "/files",
        encrypted,
        passphrase,
      );
      expect(result.documents).toBeGreaterThan(0);
      for (const doc of snapshot.files)
        expect(
          (await readFile(dir + "/files/" + doc.id)).toString("base64"),
        ).toBe(doc.data);
      const { rows: packets } = await restored.query(
        "SELECT * FROM co_packets",
      );
      for (const p of packets) expect(packetHash(p.payload)).toBe(p.hash);
      expect(
        (await restored.query("SELECT count(*)::int AS n FROM co_imports"))
          .rows[0].n,
      ).toBe(snapshot.tables.co_imports.length);
      await expect(
        restoreWorkspace(restored, dir + "/other", encrypted, passphrase),
      ).rejects.toThrow("empty");
      await expect(
        restoreWorkspace(restored, dir + "/files", encrypted, passphrase),
      ).rejects.toThrow("does not exist");
    } finally {
      await restored.end();
    }
  });
});

describe("reviewed dedicated mail", () => {
  const mail = {
    from: "fixture.sender@example.com",
    to: "fixture.recipient@example.com",
    subject: "Synthetic follow-up",
    body: "Following up on my application. Thank you for your time.",
  };
  function connect() {
    vi.stubEnv("ALLOW_GMAIL", "true");
    vi.stubEnv("GMAIL_CLIENT_ID", "fixture-client");
    vi.stubEnv("GMAIL_CLIENT_SECRET", "fixture-secret");
    vi.stubEnv("GMAIL_REFRESH_TOKEN", "fixture-refresh");
    vi.stubEnv("GMAIL_ADDRESS", mail.from);
    return vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url, options) => {
        if (String(url).includes("oauth2.googleapis.com"))
          return new Response(
            JSON.stringify({ access_token: "fixture-access" }),
          );
        if (String(url).endsWith("/profile"))
          return new Response(JSON.stringify({ emailAddress: mail.from }));
        if (String(url).endsWith("/messages/send"))
          return new Response(
            JSON.stringify({ id: "fixture-sent", threadId: "fixture-thread" }),
          );
        if (String(url).includes("messages?"))
          return new Response(
            JSON.stringify({ messages: [{ id: "fixture-inbox" }] }),
          );
        return new Response(
          JSON.stringify({
            id: "fixture-inbox",
            threadId: "fixture-thread",
            snippet: "Fixture interview invitation",
            internalDate: String(Date.now()),
            payload: {
              headers: [
                { name: "Subject", value: "Fixture invitation" },
                { name: "From", value: "recruiter@example.com" },
              ],
            },
          }),
        );
      });
  }
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  it("rejects header injection and requires explicit send confirmation and valid hash", async () => {
    expect(
      (
        await request("POST", "/mail/drafts", {
          ...mail,
          subject: "Hi\r\nBcc: victim@example.com",
        })
      ).statusCode,
    ).toBe(400);
    const draft = (await request("POST", "/mail/drafts", mail)).json();
    const provider = connect();
    expect(
      (
        await request("POST", `/mail/drafts/${draft.id}/send`, {
          hash: draft.hash,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request("POST", `/mail/drafts/${draft.id}/send`, {
          hash: "a".repeat(64),
          confirmed: true,
        })
      ).statusCode,
    ).toBe(422);
    expect(provider).not.toHaveBeenCalled();
  });
  it("verifies account, sends exact reviewed content once, and syncs bounded inbox summaries", async () => {
    const provider = connect();
    const draft = (await request("POST", "/mail/drafts", mail)).json();
    expect(
      (
        await request("POST", `/mail/drafts/${draft.id}/send`, {
          hash: draft.hash,
          confirmed: true,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request("POST", `/mail/drafts/${draft.id}/send`, {
          hash: draft.hash,
          confirmed: true,
        })
      ).json().duplicate,
    ).toBe(true);
    const sends = provider.mock.calls.filter((c) =>
      String(c[0]).endsWith("/messages/send"),
    );
    expect(sends).toHaveLength(1);
    const raw = Buffer.from(
      JSON.parse(sends[0][1]!.body as string).raw,
      "base64url",
    ).toString();
    expect(raw).toContain("To: " + mail.to);
    expect(raw).not.toContain("Bcc:");
    expect(
      Buffer.from(
        raw.split("\r\n\r\n")[1].replaceAll("\r\n", ""),
        "base64",
      ).toString(),
    ).toBe(mail.body);
    expect((await request("POST", "/mail/sync", {})).json().count).toBe(1);
    const state = (await request("GET", "/state")).json();
    expect(state.capabilities.emailConnected).toBe(true);
    expect(state.mailMessages[0].subject).toBe("Fixture invitation");
    expect(JSON.stringify(state)).not.toContain("fixture-refresh");
  });
  it("retains unknown outcomes and refuses retries until owner reconciliation", async () => {
    const provider = connect();
    const implementation = provider.getMockImplementation()!;
    provider.mockImplementation(async (url, opts) => {
      if (String(url).endsWith("/messages/send"))
        throw new Error("Simulated connection loss");
      return implementation(url, opts);
    });
    const draft = (await request("POST", "/mail/drafts", mail)).json();
    const body = { hash: draft.hash, confirmed: true };
    expect(
      (await request("POST", `/mail/drafts/${draft.id}/send`, body)).json()
        .error,
    ).toContain("unknown");
    const count = provider.mock.calls.length;
    expect(
      (await request("POST", `/mail/drafts/${draft.id}/send`, body)).statusCode,
    ).toBe(422);
    expect(provider.mock.calls).toHaveLength(count);
    expect(
      (
        await request("POST", `/mail/drafts/${draft.id}/reconcile`, {
          confirmed: true,
          state: "sent",
          evidence: "Checked synthetic Sent mailbox and found message",
        })
      ).statusCode,
    ).toBe(200);
  });
  it("serializes concurrent sends and enforces the daily attempt cap", async () => {
    const provider = connect();
    const draft = (await request("POST", "/mail/drafts", mail)).json();
    const results = await Promise.all(
      [1, 2].map(() =>
        request("POST", `/mail/drafts/${draft.id}/send`, {
          hash: draft.hash,
          confirmed: true,
        }),
      ),
    );
    expect(results.some((r) => r.statusCode === 200)).toBe(true);
    expect(
      provider.mock.calls.filter((c) =>
        String(c[0]).endsWith("/messages/send"),
      ),
    ).toHaveLength(1);
    const next = (await request("POST", "/mail/drafts", mail)).json();
    expect(
      (
        await request("POST", `/mail/drafts/${next.id}/send`, {
          hash: next.hash,
          confirmed: true,
        })
      ).json().error,
    ).toContain("limit");
  });
});
