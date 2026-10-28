import { describe, it, expect } from "vitest";
import { verifyProposals, modelReady } from "../server/models.js";
describe("proposed profile facts", () => {
  it("requires literal supporting evidence", () => {
    expect(() =>
      verifyProposals(
        {
          facts: [
            {
              category: "project",
              label: "Search",
              value: "Built search",
              quote: "Made up evidence",
            },
          ],
        },
        "Built a document search project.",
      ),
    ).toThrow();
  });
  it("accepts source-grounded suggestions for human review", () => {
    expect(
      verifyProposals(
        {
          facts: [
            {
              category: "project",
              label: "Search",
              value: "Built a document search project.",
              quote: "Built a document search project.",
            },
          ],
        },
        "Built a document search project.",
      ),
    ).toHaveLength(1);
  });
  it("does not enable private processing without explicit configuration", () => {
    expect(modelReady()).toBe(false);
  });
});
