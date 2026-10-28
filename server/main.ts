import { config } from "./config.js";
import { createDb, migrate } from "./db.js";
import { createApp } from "./app.js";
import { startWorker } from "./worker.js";
const cfg = config(),
  db = createDb(cfg.databaseUrl);
await migrate(db);
const worker = await startWorker(db, cfg);
const app = await createApp(db, cfg, worker);
await app.listen({ port: cfg.port, host: process.env.HOST || "127.0.0.1" });
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await app.close();
  await worker.stop();
  await db.end();
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
