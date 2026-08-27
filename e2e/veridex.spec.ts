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

test("renders allowed and blocked graph decisions with trace and evidence", async ({
  page,
}) => {
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
  await expect(page.getByText("OPERATED BY", { exact: true })).toBeVisible();
  await expect(page.getByText("DECISION EVALUATED")).toBeVisible();

  await page.getByRole("spinbutton", { name: "Amount" }).fill("1250");
  await page.getByRole("button", { name: "Evaluate action" }).click();

  await expect(page.getByRole("heading", { name: "Blocked" })).toBeVisible();
  await expect(
    page.locator("#evaluate").getByText("POLICY BLOCK", { exact: true })
  ).toBeVisible();
  await expect(
    page.locator("#trace").getByText("OPERATED BY", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("DECISION EVALUATED")).toBeVisible();
});

test("renders the redesigned metadata loading state before evaluation controls", async ({
  page,
}) => {
  await page.route(
    url => url.toString().includes("veridex.meta"),
    async route => {
      await new Promise(resolve => setTimeout(resolve, 350));
      await route.continue();
    }
  );
  await page.goto("/");

  await expect(page.getByLabel("Loading evaluation controls")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Evidence arrives after the action is evaluated.",
    })
  ).toBeVisible();
  await expect(page.getByLabel("Requesting agent")).toBeVisible();
});

test("renders the redesigned evaluation pending command state", async ({
  page,
}) => {
  await page.route(
    url => url.toString().includes("veridex.evaluate"),
    async route => {
      await new Promise(resolve => setTimeout(resolve, 350));
      await route.continue();
    }
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

  await expect(
    page.getByRole("button", { name: "Evaluating graph context…" })
  ).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Allowed" })).toBeVisible();
});
