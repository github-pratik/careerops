import { startLocalStore } from "./local-store.js";
import { createApp } from "../server/app.js";
import { startWorker } from "../server/worker.js";
const workspace = process.argv.includes("--workspace=library")
  ? "library"
  : "preview";
const store = await startLocalStore(workspace);
const worker = await startWorker(store.db, store.cfg);
const app = await createApp(store.db, store.cfg, worker);
await app.listen({ port: 3100, host: "127.0.0.1" });
console.log(
  "Local verification/intake workspace: " +
    workspace +
    " at http://localhost:3100. This is not cloud hosting. Owner password is in .data/" +
    workspace +
    "-password (not logged).",
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await app.close();
  await worker.stop();
  await store.stop();
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
