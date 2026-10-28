import { describe, it, expect } from "vitest";
import { classifyIntakeFile } from "../server/documents.js";
describe("selected-folder intake boundaries", () => {
  it("accepts supported resume formats without changing filename case", () => {
    expect(classifyIntakeFile("Example_Engineer.PDF")).toBe("resume");
    expect(classifyIntakeFile("resume.docx")).toBe("resume");
  });
  it("keeps transcripts and immigration records outside resume drafting", () => {
    for (const name of [
      "Final Transcript.pdf",
      "Unofficial Transcript.pdf",
      "i20Example_sevp.pdf",
      "I-20.pdf",
      "Passport.pdf",
    ])
      expect(classifyIntakeFile(name)).toBe("supporting_record");
  });
  it("does not compile source files or ingest hidden/unsupported files", () => {
    expect(classifyIntakeFile("resume.tex")).toBe("source_only");
    expect(classifyIntakeFile(".DS_Store")).toBe("unsupported");
    expect(classifyIntakeFile("portrait.png")).toBe("unsupported");
  });
});
