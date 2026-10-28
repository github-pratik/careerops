import { PgBoss } from "pg-boss";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { Db } from "./db.js";
import type { Config } from "./config.js";
import { fetchBoard } from "./sources.js";
import { randomUUID } from "node:crypto";
const exec = promisify(execFile);
export interface Queue {
  send(name: string, data: object): Promise<unknown>;
}
export async function extractDocument(db: Db, cfg: Config, id: string) {
  const {
    rows: [doc],
  } = await db.query("SELECT * FROM co_documents WHERE id=$1", [id]);
  if (!doc || doc.state === "ready") return;
  await db.query(
    "UPDATE co_documents SET state='extracting',error=NULL WHERE id=$1",
    [id],
  );
  try {
    const { stdout } = await exec(
      process.execPath,
      [
        "--max-old-space-size=192",
        "--import",
        "tsx",
        "server/extract.ts",
        path.join(cfg.dataDir, doc.id),
        doc.kind,
      ],
      {
        timeout: 30000,
        maxBuffer: 1_000_000,
        env: { PATH: process.env.PATH, NODE_ENV: process.env.NODE_ENV },
      },
    );
    const { text } = JSON.parse(stdout);
    await db.query(
      "UPDATE co_documents SET state='ready',content=$2,error=NULL WHERE id=$1",
      [id, text],
    );
  } catch {
    await db.query(
      "UPDATE co_documents SET state='needs_attention',error=$2 WHERE id=$1",
      [
        id,
        "Could not extract readable text. The file may be scanned, protected, damaged, or too large. Upload a text-based version.",
      ],
    );
  }
}
export async function scanSource(db: Db, id: string) {
  const {
    rows: [source],
  } = await db.query("SELECT * FROM co_sources WHERE id=$1", [id]);
  if (!source) return;
  try {
    const jobs = await fetchBoard(source);
    for (const j of jobs)
      await db.query(
        `INSERT INTO co_jobs(id,source_id,external_id,company,title,location,url,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(source_id,external_id) DO UPDATE SET description=excluded.description,title=excluded.title,location=excluded.location,url=excluded.url`,
        [
          randomUUID(),
          id,
          j.externalId,
          j.company,
          j.title,
          j.location,
          j.url,
          j.description,
        ],
      );
    await db.query(
      "UPDATE co_sources SET last_scan=now(),last_error=NULL WHERE id=$1",
      [id],
    );
  } catch (e) {
    await db.query("UPDATE co_sources SET last_error=$2 WHERE id=$1", [
      id,
      (e as Error).message,
    ]);
    throw e;
  }
}
export async function startWorker(db: Db, cfg: Config) {
  const boss = new PgBoss(cfg.databaseUrl);
  boss.on("error", (e) => console.error("Queue error:", e.message));
  await boss.start();
  for (const name of ["extract-document", "scan-source", "scheduled-scan"])
    await boss.createQueue(name, {
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
    });
  await boss.work("extract-document", async (jobs) => {
    for (const job of jobs)
      await extractDocument(db, cfg, (job.data as { id: string }).id);
  });
  await boss.work("scan-source", async (jobs) => {
    for (const job of jobs)
      await scanSource(db, (job.data as { id: string }).id);
  });
  await boss.work("scheduled-scan", async () => {
    const {
      rows: [settings],
    } = await db.query("SELECT paused FROM co_settings");
    if (settings.paused) return;
    const { rows } = await db.query("SELECT id FROM co_sources");
    for (const row of rows)
      await boss.send("scan-source", row, {
        singletonKey: row.id,
        singletonSeconds: 300,
      });
  });
  await boss.schedule("scheduled-scan", "0 */6 * * *");
  // Reconcile uploads committed before a process died while enqueueing.
  const { rows } = await db.query(
    "SELECT id FROM co_documents WHERE state IN ('queued','extracting')",
  );
  for (const row of rows) await boss.send("extract-document", row);
  return boss;
}
