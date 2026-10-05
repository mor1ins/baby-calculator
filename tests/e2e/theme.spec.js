import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const example = (name) =>
  JSON.parse(
    readFileSync(new URL(`../../api/examples/${name}.json`, import.meta.url)),
  );

test.beforeEach(async ({ context, page }) => {
  const day = example("day");
  const plan = {
    ...day.schedule,
    id: day.schedule.source_id,
    version: 1,
    archived: false,
  };
  await page.clock.setFixedTime(new Date(day.as_of));
  await context.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const responses = {
      "/api/v1/session": example("session"),
      "/api/v1/schedules": { items: [plan] },
      "/api/v1/days": { items: [day] },
      [`/api/v1/days/${day.date}`]: day,
    };
    await route.fulfill({ json: responses[path] || example("empty-day") });
  });
});

async function assertCssOnly(page) {
  await expect(
    page.locator("[style], svg[fill], svg[stroke], svg [fill], svg [stroke]"),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
}

for (const [mode, label] of [
  ["light", "Светлая"],
  ["dark", "Тёмная"],
]) {
  test(`${mode}: all screens, modal and graph use CSS at mobile and desktop sizes`, async ({
    page,
  }) => {
    await page.goto("/profile");
    await page.getByRole("radio", { name: label, exact: true }).check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      for (const path of ["/profile", "/", "/schedules", "/history"]) {
        await page.goto(path);
        await expect(page.locator(".session-state")).toContainText("Анна");
        await assertCssOnly(page);
        await expect(page.locator("html")).toHaveCSS("color-scheme", mode);
        await page.screenshot({
          path: `test-results/theme-${mode}-${width}-${path.slice(1) || "today"}.png`,
          fullPage: true,
        });
      }
    }
    await page.goto("/schedules");
    await page
      .getByRole("button", { name: "Изменить график", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await assertCssOnly(page);
    await page.screenshot({ path: `test-results/theme-${mode}-sheet.png` });
    await page.keyboard.press("Escape");
    await page.goto("/");
    await page.unroute("**/api/v1/**");
    await page.route("**/api/v1/session", (route) =>
      route.fulfill({ status: 503, json: {} }),
    );
    await page.reload();
    await expect(page.getByRole("alert")).toBeVisible();
    await assertCssOnly(page);
  });
}

test("auto tracks the OS, manual choice survives reload and synchronizes other tabs", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/profile");
  await expect(page.getByRole("radio", { name: "Авто" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("radio", { name: "Тёмная" }).check();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Тёмная" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const second = await context.newPage();
  await second.goto("/profile");
  await second.getByRole("radio", { name: "Светлая" }).check();
  await expect(page.getByRole("radio", { name: "Светлая" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("saved dark preference is applied before first paint even with a delayed entry script", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    localStorage.setItem("tishe.theme", "dark");
    window.themePaints = [];
    new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        window.themePaints.push({
          name: entry.name,
          theme: document.documentElement.dataset.theme,
        });
      }
    }).observe({ type: "paint", buffered: true });
  });
  await page.route(
    /\/(?:assets\/index-[^/]+\.js|src\/composition\/main\.jsx)$/,
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.continue();
    },
  );
  await page.goto("/profile");
  await expect(page.getByRole("radio", { name: "Тёмная" })).toBeChecked();
  await expect
    .poll(() => page.evaluate(() => window.themePaints.length))
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(() =>
      window.themePaints.every((paint) => paint.theme === "dark"),
    ),
  ).toBe(true);
});
