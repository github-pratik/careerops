import { it, expect, afterEach, vi } from "vitest";
import { greenhouseForm } from "../server/forms.js";
import { plain } from "../server/sources.js";
afterEach(() => vi.restoreAllMocks());
it("loads only the selected board job and retains required and consent details", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        id: 123,
        title: "Engineer",
        questions: [
          {
            label: "Are you authorized to work?",
            required: true,
            fields: [
              {
                name: "question_1",
                type: "multi_value_single_select",
                values: [
                  { value: 1, label: "Yes" },
                  { value: 0, label: "No" },
                ],
              },
            ],
          },
        ],
        data_compliance: [{ requires_consent: true }],
      }),
    ),
  );
  const result = await greenhouseForm("fixture-board", "123");
  expect(fetch.mock.calls[0][0]).toBe(
    "https://boards-api.greenhouse.io/v1/boards/fixture-board/jobs/123?questions=true",
  );
  expect(result.questions[0].required).toBe(true);
  expect(result.dataCompliance[0].requires_consent).toBe(true);
});
it("rejects unsafe board identifiers and mismatched jobs", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  await expect(greenhouseForm("../internal", "123")).rejects.toThrow(
    "identifier",
  );
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockResolvedValue(
    new Response(
      JSON.stringify({ id: 456, title: "Wrong job", questions: [] }),
    ),
  );
  await expect(greenhouseForm("fixture", "123")).rejects.toThrow("match");
});
it("turns encoded Greenhouse HTML into readable job text", () => {
  expect(
    plain("&amp;lt;p&amp;gt;Build Python &amp;amp; React&amp;lt;/p&amp;gt;"),
  ).toBe("Build Python & React");
});
