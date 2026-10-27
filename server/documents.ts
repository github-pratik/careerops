import { randomUUID } from "node:crypto";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import { digest, fileKind } from "./domain.js";
import { transaction, type Db } from "./db.js";
import type { Config } from "./config.js";

export function classifyIntakeFile(
  filename: string,
): "resume" | "supporting_record" | "source_only" | "unsupported" {
  if (filename.startsWith(".")) return "unsupported";
  if (
    /transcript|sevp|passport|social.?security|(?:^|[\s_.-])i[-_ ]?20(?:[\s_.-]|$)/i.test(
      filename,
    )
  )
    return "supporting_record";
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".tex") return "source_only";
  return [".pdf", ".docx", ".txt"].includes(ext) ? "resume" : "unsupported";
}

export async function storeDocument(
  db: Db,
  cfg: Config,
  input: { filename: string; buffer: Buffer; source: string },
) {
  if (input.buffer.length > 10 * 1024 * 1024)
    throw new Error("File exceeds 10 MB.");
  const kind = fileKind(input.filename, input.buffer),
    hash = digest(input.buffer),
    id = randomUUID();
  const filename = path.basename(input.filename).slice(0, 200);
  await mkdir(cfg.dataDir, { recursive: true, mode: 0o700 });
  await writeFile(path.join(cfg.dataDir, id), input.buffer, {
    mode: 0o600,
    flag: "wx",
  });
  let storedId: string;
  try {
    storedId = await transaction(db, async (c) => {
      const { rows } = await c.query(
        "INSERT INTO co_documents(id,hash,filename,kind,bytes) VALUES($1,$2,$3,$4,$5) ON CONFLICT(hash) DO UPDATE SET hash=excluded.hash RETURNING id",
        [id, hash, filename, kind, input.buffer.length],
      );
      const docId = rows[0].id;
      await c.query(
        "INSERT INTO co_imports(document_id,filename,source) VALUES($1,$2,$3)",
        [docId, filename, input.source.slice(0, 200)],
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
  return { id: storedId, duplicate: storedId !== id, hash, kind };
}
