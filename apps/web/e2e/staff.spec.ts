import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { E2EState } from "./seed";

const state = JSON.parse(readFileSync(new URL("./.state.json", import.meta.url), "utf8")) as E2EState;

async function submitLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs in and waits until the app has navigated away from the login page. */
async function login(page: Page, email: string, password = state.password) {
  await submitLogin(page, email, password);
  await page.waitForURL((url) => url.pathname !== "/login");
}

test("redirects signed-out visitors to the login page", async ({ page }) => {
  await page.goto(`/o/${state.orgSlug}`);
  await expect(page).toHaveURL(/\/login$/);
});

test("rejects a wrong password with a generic message", async ({ page }) => {
  await submitLogin(page, state.adminEmail, "definitely not it");
  await expect(page.locator("form").getByRole("alert")).toHaveText("Incorrect email or password.");
  await expect(page).toHaveURL(/\/login$/);
});

test("admin journey: pick org, manage members, sign out", async ({ page }) => {
  await login(page, state.adminEmail);

  // Platform admins always see the picker.
  await expect(page.getByRole("heading", { name: "Choose an organisation" })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(state.orgName) }).click();
  await expect(page).toHaveURL(new RegExp(`/o/${state.orgSlug}$`));
  await expect(page.getByText("No surveys yet")).toBeVisible();

  // Add an analyst.
  await page.getByRole("link", { name: "Members" }).click();
  const analystEmail = `e2e-analyst-${state.suffix}@example.com`;
  const form = page.locator("form", { has: page.getByRole("heading", { name: "Add a member" }) });
  await form.getByLabel("Email").fill(analystEmail);
  await form.getByLabel(/^Name/).fill("Ana Lyst");
  await form.getByLabel("Role").selectOption("analyst");
  await form.getByLabel(/^Initial password/).fill(state.password);
  await form.getByRole("button", { name: "Add member" }).click();
  await expect(form.getByRole("status")).toContainText(`Created an account for ${analystEmail}`);

  const row = page.getByRole("row", { name: /Ana Lyst/ });
  await expect(row).toBeVisible();

  // Change their role to viewer.
  await row.getByLabel(`Role for ${analystEmail}`).selectOption("viewer");
  await expect(row.getByLabel(`Role for ${analystEmail}`)).toHaveValue("viewer");
  await page.reload();
  await expect(page.getByRole("row", { name: /Ana Lyst/ }).getByLabel(`Role for ${analystEmail}`)).toHaveValue(
    "viewer",
  );

  // The only admin cannot demote themselves.
  const selfRow = page.getByRole("row", { name: /\(you\)/ });
  await selfRow.getByLabel(`Role for ${state.adminEmail}`).selectOption("analyst");
  await expect(selfRow.getByRole("alert")).toHaveText("An organisation must keep at least one admin");

  // Remove the member.
  await page.getByRole("row", { name: /Ana Lyst/ }).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("row", { name: /Ana Lyst/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(`/o/${state.orgSlug}`);
  await expect(page).toHaveURL(/\/login$/);
});

test("viewers are read-only and cannot reach admin pages", async ({ page }) => {
  // Seed a viewer through the admin UI.
  await login(page, state.adminEmail);
  const viewerEmail = `e2e-viewer-${state.suffix}@example.com`;
  await page.goto(`/o/${state.orgSlug}/members`);
  const form = page.locator("form", { has: page.getByRole("heading", { name: "Add a member" }) });
  await form.getByLabel("Email").fill(viewerEmail);
  await form.getByLabel("Role").selectOption("viewer");
  await form.getByLabel(/^Initial password/).fill(state.password);
  await form.getByRole("button", { name: "Add member" }).click();
  await expect(form.getByRole("status")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  await login(page, viewerEmail);
  // A single membership skips the picker.
  await expect(page).toHaveURL(new RegExp(`/o/${state.orgSlug}$`));
  await expect(page.getByRole("button", { name: "New survey" })).toHaveCount(0);

  await page.getByRole("link", { name: "Members" }).click();
  await expect(page.getByRole("heading", { name: "Add a member" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);

  const adminPage = await page.goto("/admin");
  expect(adminPage?.status()).toBe(404);
});

test("members cannot see organisations they don't belong to", async ({ page }) => {
  await login(page, state.adminEmail);
  await expect(page.getByRole("heading", { name: "Choose an organisation" })).toBeVisible();
  const response = await page.goto(`/o/${state.otherOrgSlug}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("platform admin creates an organisation", async ({ page }) => {
  await login(page, state.adminEmail);
  await page.goto("/admin");
  const slug = `e2e-new-${state.suffix}`;
  await page.getByLabel("Name", { exact: true }).fill(`New Co ${state.suffix}`);
  await expect(page.getByLabel("Address")).toHaveValue(`new-co-${state.suffix}`);
  await page.getByLabel("Address").fill(slug);
  await page.getByLabel(/First admin's email/).fill(state.adminEmail);
  await page.getByRole("button", { name: "Create organisation" }).click();
  await expect(page.getByRole("status")).toContainText(`/o/${slug}`);
  await expect(page.getByRole("cell", { name: `/o/${slug}` })).toBeVisible();

  await page.goto(`/o/${slug}`);
  await expect(page.getByText("No surveys yet")).toBeVisible();
});
