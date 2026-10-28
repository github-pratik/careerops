import EmbeddedPostgres from "embedded-postgres";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createDb, migrate } from "../server/db.js";
import type { Config } from "../server/config.js";

async function localSecret(file: string) {
  try {
    return await readFile(file, "utf8");
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
  const value = randomBytes(32).toString("base64url");
  try {
    await writeFile(file, value, { flag: "wx", mode: 0o600 });
    return value;
  } catch (e: any) {
    if (e.code === "EEXIST") return readFile(file, "utf8");
    throw e;
  }
}
export async function startLocalStore(
  workspace: "preview" | "library" = "preview",
) {
  await mkdir(".data", { recursive: true, mode: 0o700 });
  const password = await localSecret(`.data/${workspace}-db-password`);
  const port = workspace === "preview" ? 15440 : 15441;
  const postgres = new EmbeddedPostgres({
    databaseDir: `.data/${workspace}-db`,
    user: "postgres",
    password,
    port,
    persistent: true,
    onLog: () => {},
    onError: () => {},
    postgresFlags: ["-h", "127.0.0.1", "-k", "/tmp"],
  });
  try {
    await access(`.data/${workspace}-db/PG_VERSION`);
  } catch {
    await postgres.initialise();
  }
  await postgres.start();
  const cfg: Config = {
    databaseUrl: `postgres://postgres:${password}@127.0.0.1:${port}/postgres`,
    dataDir: process.cwd() + `/.data/${workspace}-files`,
    adminPassword: await localSecret(`.data/${workspace}-password`),
    sessionSecret: await localSecret(`.data/${workspace}-session-secret`),
    origin: "http://localhost:3100",
    port: 3100,
    secureCookies: false,
  };
  const db = createDb(cfg.databaseUrl);
  try {
    await migrate(db);
  } catch (e) {
    await db.end();
    await postgres.stop();
    throw e;
  }
  let stopped = false;
  return {
    db,
    cfg,
    async stop() {
      if (stopped) return;
      stopped = true;
      await db.end();
      await postgres.stop();
    },
  };
}
