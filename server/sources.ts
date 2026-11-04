import { sourceSchema } from "./domain.js";
export const plain = (value: unknown) => {
  let text = String(value || "");
  // Greenhouse descriptions may contain two layers of encoded HTML.
  for (let i = 0; i < 2; i++)
    text = text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#(?:39|x27);/gi, "'")
      .replace(/&nbsp;/g, " ");
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};
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
  if (jobs.length > 500)
    throw new Error(
      "Board exceeds 500 listings. Scan was not applied to avoid closing jobs from an incomplete response.",
    );
  const normalized = jobs
    .filter((j: any) => j.isListed !== false)
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
    }));
  if (
    normalized.some(
      (j) =>
        !j.title ||
        !j.url.startsWith("https://") ||
        j.externalId === "undefined",
    )
  )
    throw new Error("Source includes invalid listings. Scan was not applied.");
  return normalized;
}
