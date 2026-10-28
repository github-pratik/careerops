import { sourceSchema } from "./domain.js";
const plain = (v: unknown) =>
  String(v || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
export async function fetchBoard(source: {
  provider: string;
  board: string;
  company: string;
}) {
  const s = sourceSchema.parse(source);
  const urls = {
    greenhouse: `https://boards-api.greenhouse.io/v1/boards/${s.board}/jobs?content=true`,
    lever: `https://api.lever.co/v0/postings/${s.board}?mode=json`,
    ashby: `https://api.ashbyhq.com/posting-api/job-board/${s.board}`,
  };
  const response = await fetch(urls[s.provider], {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(
      `Source returned ${response.status}. Try later or verify the board identifier.`,
    );
  const reader = response.body!.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    size += r.value.length;
    if (size > 5_000_000) {
      await reader.cancel();
      throw new Error("Source exceeds size limit.");
    }
    chunks.push(r.value);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString());
  const jobs = s.provider === "lever" ? body : body.jobs;
  if (!Array.isArray(jobs))
    throw new Error("Source returned an unexpected format.");
  return jobs
    .filter((j: any) => j.isListed !== false)
    .slice(0, 500)
    .map((j: any) => ({
      externalId: String(j.id || j.jobUrl),
      company: s.company,
      title: plain(j.title || j.text),
      location: plain(
        j.location?.name ||
          j.categories?.location ||
          j.location ||
          "Not specified",
      ),
      url: String(
        j.absolute_url || j.applyUrl || j.hostedUrl || j.jobUrl || "",
      ),
      description: plain(
        j.content ||
          j.descriptionPlain ||
          j.descriptionHtml ||
          j.description ||
          "",
      ).slice(0, 60000),
    }))
    .filter((j) => j.title && j.url.startsWith("https://"));
}
