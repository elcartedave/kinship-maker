import { expect, test, type Page } from "@playwright/test";

function supabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

async function placeSymbol(page: Page, name: string) {
  await page.getByRole("button", { name: new RegExp(`^${name}$`, "i") }).click();
  const canvas = page.getByRole("button", {
    name: new RegExp(`Place ${name} on canvas`, "i"),
  });
  const box = await canvas.boundingBox();

  if (!box) {
    throw new Error("Canvas is not visible");
  }

  await canvas.click({
    position: { x: box.width * 0.52, y: box.height * 0.78 },
  });
}

test("creates a chart and restores it after reload", async ({ page }) => {
  test.skip(
    supabaseConfigured(),
    "Creating charts requires Google sign-in when Supabase is configured",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "New chart" }).click();

  await expect(page).toHaveURL(/\/charts\//);
  await page.getByLabel("Chart title").fill("Reload test");
  await placeSymbol(page, "Female");

  const nodeLabel = page.getByLabel(/Label for female/i).first();
  await nodeLabel.fill("Ego");
  await page.waitForTimeout(900);
  await page.reload();

  await expect(page.getByLabel("Chart title")).toHaveValue("Reload test");
  await expect(page.getByLabel(/Label for female/i).first()).toHaveValue("Ego");
});

test("exports png and pdf after placing a symbol", async ({ page }) => {
  test.skip(
    supabaseConfigured(),
    "Creating charts requires Google sign-in when Supabase is configured",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "New chart" }).click();
  await placeSymbol(page, "Male");

  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG" }).click();
  await pngDownload;

  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF" }).click();
  await pdfDownload;
});

test("reopens a cached chart while offline after first load", async ({
  context,
  page,
}) => {
  test.skip(
    supabaseConfigured(),
    "Creating charts requires Google sign-in when Supabase is configured",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "New chart" }).click();
  await page.getByLabel("Chart title").fill("Offline chart");
  await page.waitForTimeout(900);

  const url = page.url();
  await page.reload();
  await context.setOffline(true);
  await page.goto(url);

  await expect(page.getByLabel("Chart title")).toHaveValue("Offline chart");
});

test("shows the cloud sign-in form on the dashboard", async ({ page }) => {
  await page.goto("/");
  if (supabaseConfigured()) {
    await expect(
      page.getByRole("button", { name: /continue with google/i }),
    ).toBeVisible();
    return;
  }

  await expect(
    page.getByText(/turn on private cloud sync/i),
  ).toBeVisible();
});
