/**
 * End-to-end tests for the key user journeys.
 * Requirements: the app running locally with a Supabase project connected and
 * the migration + seed applied. For the signed-in tests, create a confirmed
 * test account and set E2E_USER_EMAIL and E2E_USER_PASSWORD.
 * These tests CREATE real records in the connected database — use a test project.
 */
import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const PHOTO = path.join(process.cwd(), "tests", "e2e", "fixtures", "test-photo.jpg");
const USER_EMAIL = process.env.E2E_USER_EMAIL;
const USER_PASSWORD = process.env.E2E_USER_PASSWORD;

function recentLocalDateTime() {
  const d = new Date(Date.now() - 2 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(USER_EMAIL!);
  await page.getByLabel("Password").fill(USER_PASSWORD!);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("home page shows the headline and both main buttons work", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Lost pets.");
  await page.getByRole("link", { name: "I've Found a Pet" }).click();
  await expect(page).toHaveURL(/\/report\/found/);
  await page.goto("/");
  await page.getByRole("link", { name: "I've Lost a Pet" }).click();
  await expect(page).toHaveURL(/\/(report\/lost|login)/);
});

test("reporting a lost pet requires an account", async ({ page }) => {
  await page.goto("/report/lost");
  await expect(page).toHaveURL(/\/login\?next=%2Freport%2Flost/);
});

test("found form shows clear errors when empty", async ({ page }) => {
  await page.goto("/report/found");
  await page.getByRole("button", { name: "Publish found pet report" }).click();
  const status = page.locator("[data-form-status]");
  await expect(status).toContainText("Please check the highlighted details");
  await expect(status).toContainText("Please choose dog or cat");
  await expect(status).toContainText("Please tell us where the animal is now");
});

test("someone without an account can report a found pet and manage it", async ({ page }) => {
  await page.goto("/report/found");
  await page.locator("#photoPicker").setInputFiles(PHOTO);
  await expect(page.getByRole("img", { name: "Selected photo 1" })).toBeVisible();
  await page.getByLabel("Dog", { exact: true }).check();
  await page.getByLabel("Main colour").fill("Brown");
  await page.getByLabel("Breed").fill("E2E test dog");
  await page.getByLabel("Found", { exact: true }).fill(recentLocalDateTime());
  await page.getByLabel("Suburb").fill("Rowville");
  await page.getByLabel("At a vet clinic").check();
  await page.getByLabel("Email").fill("e2e-finder@example.com");
  await page.getByRole("checkbox", { name: /details are accurate/ }).check();
  await page.getByRole("button", { name: "Publish found pet report" }).click();

  await expect(page).toHaveURL(/\/report\/submitted\//, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Your report is live" })).toBeVisible();
  const manageLink = await page.locator("p.font-mono").innerText();
  expect(manageLink).toMatch(/\/manage\/.+#t=/);

  // Public page exists and persists after refresh
  await page.getByRole("link", { name: "View public page" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Brown");
  await expect(page.locator("body")).not.toContainText("e2e-finder@example.com");

  // Private manage link works and can close the report
  await page.goto(manageLink);
  await expect(page.getByRole("heading", { name: /Found:/ })).toBeVisible();
  await page.getByRole("button", { name: "Close report" }).click();
  await expect(page.getByRole("status")).toContainText("Report closed");
});

test("a wrong manage link is rejected", async ({ page }) => {
  await page.goto("/manage/00000000-0000-0000-0000-000000000000#t=not-a-real-token");
  await expect(page.getByRole("alert")).toContainText("isn't valid");
});

test("search filters reports", async ({ page }) => {
  await page.goto("/search?kind=lost&species=cat");
  await expect(page.getByRole("status")).toContainText("report");
  const cards = page.locator("article");
  for (const text of await cards.allInnerTexts()) expect(text).toContain("Lost");
});

test("demo records can't receive messages", async ({ page }) => {
  await page.goto("/search?q=Cavoodle&kind=lost");
  await page.locator("article a").first().click();
  await expect(page.getByText("This is a fictional demonstration record")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toHaveCount(0);
});

test("signed-out visitors can't open the admin or partner pages", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/partner/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test.describe("signed-in owner", () => {
  test.skip(!USER_EMAIL || !USER_PASSWORD, "Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run");

  test("reports a lost pet, sees it in the dashboard, and marks it reunited", async ({ page }) => {
    await login(page);
    await page.goto("/report/lost");
    await page.locator("#photoPicker").setInputFiles(PHOTO);
    await page.getByLabel("Cat", { exact: true }).check();
    await page.getByLabel("Pet's name").fill("E2E Whiskers");
    await page.getByLabel("Main colour").fill("Ginger");
    await page.getByLabel("Last seen", { exact: true }).fill(recentLocalDateTime());
    await page.getByLabel("Suburb").fill("Boronia");
    await page.getByLabel("Microchip number").fill("956000099999999");
    await page.getByRole("checkbox", { name: /details are accurate/ }).check();
    await page.getByRole("button", { name: "Publish lost pet report" }).click();
    await expect(page).toHaveURL(/\/report\/submitted\//, { timeout: 30_000 });

    await page.getByRole("link", { name: "View public page" }).click();
    await expect(page.locator("body")).not.toContainText("956000099999999"); // microchip never public

    await page.goto("/dashboard");
    const card = page.locator("li", { hasText: "E2E Whiskers" }).first();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Mark as reunited" }).click();
    await expect(card.getByRole("status")).toContainText("reunited");
  });

  test("a regular user is kept out of the admin page", async ({ page }) => {
    await login(page);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dashboard\?denied=1/);
  });
});
