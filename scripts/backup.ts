import "dotenv/config";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createDb, migrate } from "../server/db.js";
import { backupWorkspace, restoreWorkspace } from "../server/backup.js";
const [mode, file] = process.argv.slice(2);
if (
  !["create", "restore"].includes(mode) ||
  !file ||
  !process.env.DATABASE_URL ||
  !process.env.BACKUP_PASSPHRASE
)
  throw new Error(
    "Usage: npm run backup -- create|restore PATH. Set DATABASE_URL, DATA_DIR and BACKUP_PASSPHRASE privately. Stop the app before restore; use a fresh database and absent document directory.",
  );
const db = createDb(process.env.DATABASE_URL);
try {
  const dataDir = path.resolve(process.env.DATA_DIR || ".data/files");
  if (mode === "create") {
    const encrypted = await backupWorkspace(
      db,
      dataDir,
      process.env.BACKUP_PASSPHRASE,
    );
    await mkdir(path.dirname(path.resolve(file)), {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(file, encrypted, { mode: 0o600, flag: "wx" });
    console.log(
      "Encrypted backup created. Keep a private off-host copy and its passphrase separately.",
    );
  } else {
    await migrate(db);
    const result = await restoreWorkspace(
      db,
      dataDir,
      await readFile(file),
      process.env.BACKUP_PASSPHRASE,
    );
    console.log("Restored and hash-verified documents:", result.documents);
  }
} finally {
  await db.end();
}
