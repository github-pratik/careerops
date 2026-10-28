import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import pg from "pg";
import { randomUUID } from "node:crypto";
test("owner can upload a PDF, confirm a fact, prepare and approve a packet", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  const fixtureId = randomUUID();
  const filename = `browser-test-${fixtureId}.pdf`;
  page.on("pageerror", (e) => errors.push(e.message));
  const password = await readFile(".data/preview-password", "utf8");
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Owner password").fill(password);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Your next chapter." }),
  ).toBeVisible();
  await mkdir(".data/screenshots", { recursive: true });
  await page.screenshot({
    path: ".data/screenshots/overview.png",
    fullPage: true,
  });
  const pdfPage = await browser.newPage();
  await pdfPage.setContent(
    `<h1>Browser Test Candidate ${fixtureId}</h1><p>Built a document search project using Python.</p>`,
  );
  const pdf = await pdfPage.pdf();
  await pdfPage.close();
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await page.getByLabel("Upload documents").setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await expect(page.getByText(filename, { exact: true })).toBeVisible();
  await expect(
    page
      .locator(".document")
      .filter({ hasText: filename })
      .getByText("Ready", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.screenshot({
    path: ".data/screenshots/documents.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByLabel("Category", { exact: true }).selectOption("project");
  await page.getByLabel("Label", { exact: true }).fill("Browser test project");
  await page
    .getByLabel("Accurate details")
    .fill("Built a document search project using Python.");
  await page.getByLabel("I confirm these details are accurate.").check();
  await page.getByRole("button", { name: "Save confirmed fact" }).click();
  await expect(
    page.getByRole("heading", { name: "Browser test project" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Opportunities", exact: true })
    .click();
  await page.getByText("Add an opportunity or connect a company board").click();
  await page
    .getByLabel("Company", { exact: true })
    .fill("Browser Test Company");
  await page
    .getByLabel("Job title", { exact: true })
    .fill("Browser Test Engineer");
  await page.getByLabel("Work location").fill("Remote — location unverified");
  await page
    .getByLabel("HTTPS application URL")
    .fill("https://example.com/browser-test-job");
  await page
    .getByLabel("Full job description")
    .fill(
      "Develop and maintain document search software using Python with the engineering team.",
    );
  await page.getByRole("button", { name: "Save opportunity" }).click();
  const job = page
    .locator("article.job")
    .filter({ hasText: "Browser Test Engineer" });
  await expect(job).toBeVisible();
  await expect(job.getByRole("button",{name:"Assess fit"})).toBeDisabled();
  await job.getByRole("button", { name: "Prepare packet" }).click();
  await page.getByRole("button", { name: "Create review packet" }).click();
  await expect(
    page.getByRole("heading", { name: "Review", exact: true }),
  ).toBeVisible();
  await page
    .locator("article.job")
    .filter({ hasText: "Browser Test Engineer" })
    .first()
    .getByRole("button", { name: "Inspect packet" })
    .click();
  await page
    .getByLabel("I reviewed these details and the resume preview for accuracy.")
    .check();
  await page.getByRole("button", { name: "Approve this version" }).click();
  await expect(
    page.getByText(
      "Approved draft retained. No application has been submitted.",
    ),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: ".data/screenshots/mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test.afterAll(async () => {
  // Remove only the explicitly named synthetic browser-test records, leaving originals untouched.
  const password = await readFile(".data/preview-db-password", "utf8");
  const db = new pg.Pool({
    connectionString: `postgres://postgres:${password}@127.0.0.1:15440/postgres`,
  });
  await db.query(
    "DELETE FROM co_packets WHERE job_id IN (SELECT id FROM co_jobs WHERE url='https://example.com/browser-test-job')",
  );
  await db.query(
    "DELETE FROM co_jobs WHERE url='https://example.com/browser-test-job'",
  );
  await db.query("DELETE FROM co_facts WHERE label='Browser test project'");
  await db.end();
});
