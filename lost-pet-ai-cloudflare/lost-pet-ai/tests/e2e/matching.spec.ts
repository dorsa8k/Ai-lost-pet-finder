/**
 * Browser tests for AI matching privacy. Run against a deployed or local site
 * with the Phase 2 migration applied (see README → "Run the tests").
 */
import { test, expect } from "@playwright/test";

async function firstReportId(page: import("@playwright/test").Page): Promise<string> {
  await page.goto("/search");
  const href = await page.locator("article a").first().getAttribute("href");
  const id = href?.split("/").pop();
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  return id!;
}

test("matches are private: a visitor without the manage link can't see them", async ({ page, request }) => {
  const id = await firstReportId(page);
  await page.goto(`/pets/${id}/matches`);
  await expect(page.getByRole("alert")).toContainText("Only the person who made this report");
  const api = await request.post(`/api/reports/${id}/matches`, { data: {} });
  expect(api.status()).toBe(403);
  const wrongToken = await request.post(`/api/reports/${id}/matches`, { data: { token: "not-the-token" } });
  expect(wrongToken.status()).toBe(403);
});

test("visitors can't trigger matching or leave feedback on someone else's report", async ({ page, request }) => {
  const id = await firstReportId(page);
  expect((await request.post(`/api/reports/${id}/rematch`, { data: {} })).status()).toBe(403);
  const fb = await request.post(`/api/matches/00000000-0000-0000-0000-000000000000/feedback`, {
    data: { reportId: id, verdict: "likely_same" },
  });
  expect(fb.status()).toBe(403);
});

test("the photo route only serves real report photo paths", async ({ request }) => {
  expect((await request.get("/photos/../../etc/passwd")).status()).toBe(404);
  expect((await request.get("/photos/reports/not-a-uuid/x.jpg")).status()).toBe(404);
  expect(
    (await request.get("/photos/reports/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000.jpg")).status(),
  ).toBe(404);
});

test("unsubscribe links must be signed", async ({ request }) => {
  const res = await request.post("/api/unsubscribe", {
    multipart: { k: "report", id: "00000000-0000-0000-0000-000000000000", t: "forged" },
  });
  expect(res.status()).toBe(403);
});

test("someone who reports a found pet can open its matches page with their private link", async ({ page }) => {
  await page.goto("/report/found");
  await page.locator("#photoPicker").setInputFiles("tests/e2e/fixtures/test-photo.jpg");
  await page.getByLabel("Dog", { exact: true }).check();
  await page.getByLabel("Main colour").fill("Brown");
  const d = new Date(Date.now() - 3600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  await page.getByLabel("Found", { exact: true }).fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  await page.getByLabel("Suburb").fill("Rowville");
  await page.getByLabel("At a vet clinic").check();
  await page.getByLabel("Email").fill("e2e-matching@example.com");
  await page.getByRole("checkbox", { name: /details are accurate/ }).check();
  await page.getByRole("button", { name: "Publish found pet report" }).click();
  await expect(page).toHaveURL(/\/report\/submitted\//, { timeout: 30_000 });
  const manageLink = await page.locator("p.font-mono").innerText();
  await page.goto(manageLink);
  await page.getByRole("link", { name: "View possible matches" }).click();
  await expect(page.getByText("These are AI suggestions, not confirmed matches")).toBeVisible();
  // Either suggestions or the helpful empty state — never an error.
  await expect(page.getByText(/AI suggestion #1|No possible matches yet/)).toBeVisible({ timeout: 60_000 });
  // Clean up
  await page.goto(manageLink);
  await page.getByRole("button", { name: "Close report" }).click();
});
