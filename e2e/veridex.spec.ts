import { expect, test } from "@playwright/test";

const baseURL = process.env.VERIDEX_E2E_BASE_URL;

test.skip(
  !baseURL,
  "Set VERIDEX_E2E_BASE_URL to run against a seeded Veridex server."
);

test("evaluates, explains, approves, and audits an approval-required action", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Requesting agent")).toBeVisible();
  await expect(page.getByText("No request is selected.")).toBeVisible();

  await page
    .getByLabel("Requested action")
    .selectOption({ label: "Issue Refund" });
  await page
    .getByLabel("Affected resource")
    .selectOption({ label: "Invoice #1844" });
  await page.getByRole("spinbutton", { name: "Amount" }).fill("750");
  await page.getByRole("button", { name: "Evaluate action" }).click();

  await expect(
    page.getByRole("heading", { name: "Approval required" })
  ).toBeVisible();
  await expect(page.getByText("OPERATED BY")).toBeVisible();
  await expect(page.getByText("PENDING", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();

  await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();
  await expect(page.getByText("APPROVAL DECIDED")).toBeVisible();
});

test("shows explicit safe query failure states", async ({ page }) => {
  await page.route(
    url => url.toString().includes("veridex.evidence"),
    route => route.abort("failed")
  );
  await page.goto("/");
  await expect(page.getByLabel("Requesting agent")).toBeVisible();

  await page
    .getByLabel("Requested action")
    .selectOption({ label: "Issue Refund" });
  await page
    .getByLabel("Affected resource")
    .selectOption({ label: "Invoice #1844" });
  await page.getByRole("spinbutton", { name: "Amount" }).fill("240");
  await page.getByRole("button", { name: "Evaluate action" }).click();
  await expect(page.getByRole("heading", { name: "Allowed" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    /Failed to fetch|Network/i
  );

  await page.route(
    url => url.toString().includes("veridex.explain"),
    route => route.abort("failed")
  );
  await page.getByRole("button", { name: "Recheck explanation" }).click();
  await expect(page.getByRole("alert")).toHaveCount(2);
});
