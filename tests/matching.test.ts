import { describe, it, expect } from "vitest";
import { verifyAssessment, jobSnapshot } from "../server/matching.js";
import { preferencesSchema, packetHash } from "../server/domain.js";
const factId = "11111111-1111-4111-8111-111111111111";
const job = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Software Engineer",
  company: "Fixture Company",
  location: "Remote",
  url: "https://example.com/job",
  description: "Build services with Python. Kubernetes is preferred.",
};
const assessment = {
  score: 75,
  summary:
    "Relevant project evidence; deployment experience is not established.",
  matches: [
    {
      requirementQuote: "Python",
      factId,
      reason: "Confirmed project used Python.",
    },
  ],
  gaps: [{ requirementQuote: "Kubernetes", reason: "No confirmed evidence." }],
  recommendedFactIds: [factId],
  warnings: ["Confirm the permitted remote work countries."],
};
describe("evidence-grounded matching", () => {
  it("validates references but never marks work authorization established", () => {
    expect(
      verifyAssessment({ ...assessment, eligibility: "eligible" }, job, [
        { id: factId },
      ]).eligibility,
    ).toBe("requires_review");
  });
  it("rejects unknown facts instead of inventing experience", () => {
    expect(() =>
      verifyAssessment(
        {
          ...assessment,
          recommendedFactIds: ["33333333-3333-4333-8333-333333333333"],
        },
        job,
        [{ id: factId }],
      ),
    ).toThrow(/unknown/);
  });
  it("requires real job quotes for both matches and gaps", () => {
    expect(() =>
      verifyAssessment(
        {
          ...assessment,
          gaps: [
            {
              requirementQuote: "Must have ten years of experience",
              reason: "Not met",
            },
          ],
        },
        job,
        [{ id: factId }],
      ),
    ).toThrow(/absent/);
  });
  it("rejects duplicate fact references and scores outside the range", () => {
    expect(() =>
      verifyAssessment(
        { ...assessment, recommendedFactIds: [factId, factId] },
        job,
        [{ id: factId }],
      ),
    ).toThrow(/Repeated/);
    expect(() =>
      verifyAssessment({ ...assessment, score: 101 }, job, [{ id: factId }]),
    ).toThrow();
  });
  it("invalidates snapshots when a location or title changes", () => {
    expect(packetHash(jobSnapshot(job))).not.toBe(
      packetHash(jobSnapshot({ ...job, location: "Onsite" })),
    );
  });
  it("keeps take-home targets optional and prevents unauthorized budget increases", () => {
    const preferences = {
      monthlyBudgetUsd: 10,
      usualNetMonthlyUsd: null,
      indiaRemoteFlexible: true,
      markets: ["Example market"],
    };
    expect(preferencesSchema.parse(preferences).usualNetMonthlyUsd).toBeNull();
    expect(() =>
      preferencesSchema.parse({ ...preferences, monthlyBudgetUsd: 11 }),
    ).toThrow();
  });
});
