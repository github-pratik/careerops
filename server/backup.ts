import {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { digest } from "./domain.js";
import { transaction, type Db } from "./db.js";

// Parent records precede their dependents on restore. Queue internals and secrets are excluded.
const tables = [
  "co_settings",
  "co_documents",
  "co_imports",
  "co_facts",
  "co_sources",
  "co_jobs",
  "co_packets",
  "co_audit",
  "co_proposals",
  "co_model_calls",
  "co_assessments",
  "co_applications",
  "co_mail_drafts",
  "co_mail_messages",
  "co_mail_state",
] as const;
const maxBytes = 100 * 1024 * 1024;
const snapshotSchema = z.object({
  format: z.literal("careerops-backup-v1"),
  createdAt: z.string(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  files: z.array(
    z.object({
      id: z.string().uuid(),
      hash: z.string().regex(/^[a-f0-9]{64}$/),
      bytes: z.number().int().nonnegative(),
      data: z.string(),
    }),
  ),
});
function key(password: string, salt: Buffer) {
  if (password.length < 20)
    throw new Error("Use a backup passphrase of at least 20 characters.");
  return scryptSync(password, salt, 32);
}
export function encryptSnapshot(snapshot: unknown, password: string) {
  const data = Buffer.from(JSON.stringify(snapshot));
  if (data.length > maxBytes)
    throw new Error("Backup exceeds the 100 MB limit.");
  const salt = randomBytes(16),
    iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(password, salt), iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([
    Buffer.from("COBACK01"),
    salt,
    iv,
    cipher.getAuthTag(),
    encrypted,
  ]);
}
export function decryptSnapshot(data: Buffer, password: string) {
  if (
    data.length < 52 ||
    data.length > maxBytes + 52 ||
    data.subarray(0, 8).toString() !== "COBACK01"
  )
    throw new Error("Invalid backup format or size.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(password, data.subarray(8, 24)),
    data.subarray(24, 36),
  );
  decipher.setAuthTag(data.subarray(36, 52));
  const snapshot = snapshotSchema.parse(
    JSON.parse(
      Buffer.concat([
        decipher.update(data.subarray(52)),
        decipher.final(),
      ]).toString(),
    ),
  );
  if (
    Object.keys(snapshot.tables).length !== tables.length ||
    tables.some((t) => !Array.isArray(snapshot.tables[t]))
  )
    throw new Error("Backup table inventory is incomplete.");
  if (
    snapshot.tables.co_settings.length !== 1 ||
    snapshot.tables.co_settings[0].id !== true
  )
    throw new Error("Backup settings are invalid.");
  const docs = snapshot.tables.co_documents;
  if (
    snapshot.files.length !== docs.length ||
    new Set(snapshot.files.map((f) => f.id)).size !== docs.length
  )
    throw new Error("Backup document inventory is inconsistent.");
  for (const file of snapshot.files) {
    const bytes = Buffer.from(file.data, "base64");
    const doc = docs.find((d) => d.id === file.id);
    if (
      !doc ||
      bytes.length !== file.bytes ||
      digest(bytes) !== file.hash ||
      doc.hash !== file.hash ||
      doc.bytes !== file.bytes
    )
      throw new Error("Backup document integrity failed.");
  }
  return snapshot;
}
export async function backupWorkspace(
  db: Db,
  dataDir: string,
  password: string,
) {
  return transaction(db, async (c) => {
    await c.query("SELECT * FROM co_settings FOR UPDATE");
    // Wait for writers and freeze the application tables while taking the paired snapshot.
    await c.query(`LOCK TABLE ${tables.join(",")} IN SHARE MODE`);
    const records: Record<string, Record<string, unknown>[]> = {};
    for (const table of tables)
      records[table] = (await c.query(`SELECT * FROM ${table}`)).rows;
    const files = [];
    let total = 0;
    for (const doc of records.co_documents) {
      const id = z.string().uuid().parse(doc.id);
      const bytes = await readFile(path.join(dataDir, id));
      total += bytes.length;
      if (total > maxBytes / 2)
        throw new Error("Original files exceed the backup size limit.");
      if (digest(bytes) !== doc.hash || bytes.length !== doc.bytes)
        throw new Error("Stored document integrity failed.");
      files.push({
        id,
        hash: doc.hash,
        bytes: bytes.length,
        data: bytes.toString("base64"),
      });
    }
    return encryptSnapshot(
      {
        format: "careerops-backup-v1",
        createdAt: new Date().toISOString(),
        tables: records,
        files,
      },
      password,
    );
  });
}
export async function restoreWorkspace(
  db: Db,
  dataDir: string,
  encrypted: Buffer,
  password: string,
) {
  const snapshot = decryptSnapshot(encrypted, password);
  // Require a fresh destination: never merge into or overwrite an existing library.
  const destination = path.resolve(dataDir);
  try {
    await readdir(destination);
    throw new Error(
      "Restore requires a document directory that does not exist.",
    );
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
  const staging = destination + ".restore-" + randomBytes(8).toString("hex");
  await mkdir(staging, { recursive: true, mode: 0o700 });
  let published = false;
  try {
    for (const file of snapshot.files)
      await writeFile(
        path.join(staging, file.id),
        Buffer.from(file.data, "base64"),
        { mode: 0o600, flag: "wx" },
      );
    await transaction(db, async (c) => {
      await c.query(`LOCK TABLE ${tables.join(",")} IN EXCLUSIVE MODE`);
      for (const table of tables) {
        const {
          rows: [count],
        } = await c.query(`SELECT count(*)::int AS n FROM ${table}`);
        if (count.n > (table === "co_settings" ? 1 : 0))
          throw new Error(
            "Restore requires a fresh, empty application database.",
          );
      }
      await c.query("DELETE FROM co_settings");
      for (const table of tables) {
        const { rows: columns } = await c.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1",
          [table],
        );
        const known = new Set(columns.map((r) => r.column_name));
        for (const row of snapshot.tables[table]) {
          const names = Object.keys(row);
          if (!names.length || names.some((n) => !known.has(n)))
            throw new Error(
              "Backup schema is incompatible with this application.",
            );
          await c.query(
            `INSERT INTO ${table} (${names.map((n) => '"' + n + '"').join(",")}) VALUES(${names.map((_, i) => "$" + (i + 1)).join(",")})`,
            names.map((n) => row[n]),
          );
        }
      }
      await c.query("UPDATE co_settings SET paused=true");
      await c.query(
        "UPDATE co_mail_drafts SET state='unknown' WHERE state='sending'",
      );
      for (const table of ["co_imports", "co_audit"])
        await c.query(
          `SELECT setval(pg_get_serial_sequence('${table}','id'),coalesce(max(id),1),max(id) IS NOT NULL) FROM ${table}`,
        );
      await rename(staging, destination);
      published = true;
    });
  } catch (e) {
    // A connection loss during COMMIT can have an unknown outcome. Retain published
    // originals for reconciliation rather than deleting possibly committed records' files.
    if (!published) await rm(staging, { recursive: true, force: true });
    throw e;
  }
  return { documents: snapshot.files.length, tables: tables.length };
}
