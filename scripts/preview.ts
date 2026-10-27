import EmbeddedPostgres from "embedded-postgres";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createDb, migrate } from "../server/db.js";
import { createApp } from "../server/app.js";
import { startWorker } from "../server/worker.js";
await mkdir(".data", { recursive: true, mode: 0o700 });
let password: string;
try {
  password = await readFile(".data/preview-password", "utf8");
} catch {
  password = randomBytes(20).toString("base64url");
  await writeFile(".data/preview-password", password, {
    mode: 0o600,
    flag: "wx",
  });
}
let dbPassword: string;
try {
  dbPassword = await readFile(".data/preview-db-password", "utf8");
} catch {
  dbPassword = randomBytes(20).toString("base64url");
  await writeFile(".data/preview-db-password", dbPassword, {
    mode: 0o600,
    flag: "wx",
  });
}
const postgres = new EmbeddedPostgres({
  databaseDir: ".data/preview-db",
  user: "postgres",
  password: dbPassword,
  port: 15440,
  persistent: true,
  onLog: () => {},
  onError: console.error,
  postgresFlags: ["-h", "127.0.0.1", "-k", "/tmp"],
});
try {
  await access(".data/preview-db/PG_VERSION");
} catch {
  await postgres.initialise();
}
await postgres.start();
const cfg = {
  databaseUrl: `postgres://postgres:${dbPassword}@127.0.0.1:15440/postgres`,
  dataDir: process.cwd() + "/.data/preview-files",
  adminPassword: password,
  sessionSecret: randomBytes(48).toString("hex"),
  origin: "http://localhost:3100",
  port: 3100,
  secureCookies: false,
};
const db = createDb(cfg.databaseUrl);
await migrate(db);
const worker = await startWorker(db, cfg);
const app = await createApp(db, cfg, worker);
await app.listen({ port: 3100, host: "127.0.0.1" });
console.log(
  "Development verification only: http://localhost:3100. Owner password is in .data/preview-password (not logged).",
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await app.close();
  await worker.stop();
  await db.end();
  await postgres.stop();
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
