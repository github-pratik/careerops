import {
  readdir,
  readFile,
  writeFile,
  mkdir,
  stat,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { startLocalStore } from "./local-store.js";
import { classifyIntakeFile, storeDocument } from "../server/documents.js";
import { extractDocument } from "../server/worker.js";
import { digest } from "../server/domain.js";

const folder = process.argv[2];
if (!folder)
  throw new Error(
    "Usage: node --import tsx scripts/import-resumes.ts /explicit/resume/folder",
  );
const source = await realpath(folder);
if (!(await stat(source)).isDirectory()) throw new Error("Choose a directory.");
const entries = await readdir(source, { withFileTypes: true });
const reportDir = path.resolve(".data/resume-intake");
await mkdir(reportDir, { recursive: true, mode: 0o700 });
const store = await startLocalStore("library");
const results: any[] = [];
try {
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue;
    if (!entry.isFile()) {
      results.push({
        filename: entry.name,
        state: "skipped",
        reason:
          "Not a regular file; directories and symbolic links are not followed.",
      });
      continue;
    }
    const classification = classifyIntakeFile(entry.name);
    if (classification !== "resume") {
      results.push({
        filename: entry.name,
        state: "skipped",
        reason: classification,
      });
      continue;
    }
    const file = path.join(source, entry.name);
    try {
      if ((await stat(file)).size > 10 * 1024 * 1024)
        throw new Error("File exceeds 10 MB.");
      const buffer = await readFile(file);
      const saved = await storeDocument(store.db, store.cfg, {
        filename: entry.name,
        buffer,
        source: "Selected local resume folder",
      });
      await extractDocument(store.db, store.cfg, saved.id);
      const {
        rows: [document],
      } = await store.db.query(
        "SELECT state,length(content) AS characters,error FROM co_documents WHERE id=$1",
        [saved.id],
      );
      const stored = await readFile(path.join(store.cfg.dataDir, saved.id));
      if (digest(stored) !== saved.hash)
        throw new Error(
          "Stored original failed its content hash verification.",
        );
      results.push({
        filename: entry.name,
        id: saved.id,
        hash: saved.hash,
        duplicate: saved.duplicate,
        state: document.state,
        characters: document.characters,
        error: document.error,
      });
    } catch (e) {
      results.push({
        filename: entry.name,
        state: "failed",
        error: (e as Error).message,
      });
    }
  }
  const counts = {
    imported: results.filter((r) => r.id).length,
    ready: results.filter((r) => r.state === "ready").length,
    duplicates: results.filter((r) => r.duplicate).length,
    needsAttention: results.filter(
      (r) => r.state === "needs_attention" || r.state === "failed",
    ).length,
    skipped: results.filter((r) => r.state === "skipped").length,
  };
  const report = {
    createdAt: new Date().toISOString(),
    sourceFolder: source,
    workspace: "library",
    unverified: true,
    counts,
    documents: results,
  };
  await writeFile(
    path.join(reportDir, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  const escape = (value: unknown) =>
    String(value ?? "")
      .replace(/\|/g, "\\|")
      .replace(/[\r\n]/g, " ");
  const markdown = [
    "# Private resume intake report",
    "",
    "Original files were preserved. Copied originals passed SHA-256 verification. No cloud or model upload was performed. Imported content is unverified evidence, not approved profile facts.",
    "",
    "| File | State | Extracted characters | Note |",
    "|---|---|---:|---|",
    ...results.map(
      (r) =>
        `| ${escape(r.filename)} | ${r.state} | ${r.characters ?? ""} | ${escape(r.reason || r.error || (r.duplicate ? "Existing identical document" : "New private copy"))} |`,
    ),
    "",
    `Imported: ${counts.imported}; readable: ${counts.ready}; duplicates: ${counts.duplicates}; attention: ${counts.needsAttention}; skipped: ${counts.skipped}.`,
    "",
    "The isolated library database and originals are under ignored .data/. This is local intake staging, not a cloud deployment.",
    "",
  ];
  await writeFile(path.join(reportDir, "report.md"), markdown.join("\n"), {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      counts,
      report: path.join(reportDir, "report.md"),
      private: true,
    }),
  );
} finally {
  await store.stop();
}
