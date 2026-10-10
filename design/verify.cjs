// Run from repository root: node design/verify.cjs (uses the existing tests dependencies).
const { chromium } = require("../tests/node_modules/playwright");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      colorScheme: "light",
    });
    const openReportActions = async () => {
      if (!await page.locator('#sheet').evaluate(el=>el.open)) await page.locator('[data-report="actions"]').click();
    };
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      pathToFileURL(path.join(__dirname, "index.html")).href + "#statistics",
    );
    await page
      .getByRole("heading", { name: "Статистика", exact: true })
      .waitFor();
    assert.match(await page.locator("#screen").innerText(), /6 из 7 циклов/);
    for (const width of [320, 360, 375, 390, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of ["statistics", "history", "profile", "day"]) {
        await page.evaluate((route) => navigate(route), route);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `${route} overflows ${width}`,
        );
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => navigate("statistics"));
    for (const width of [320, 360, 375, 390, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      for (const label of ["Ритм суток", "День → ночь", "Изменения", "Обзор"]) {
        await page.getByRole("button", { name: label, exact: true }).click();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `${label} overflows ${width}`,
        );
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [label, file] of [
      ["Ритм суток", "20-daily-rhythm"],
      ["День → ночь", "21-day-night"],
      ["Изменения", "22-changes"],
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.screenshot({
        path: path.join(__dirname, `previews/${file}.png`),
        fullPage: true,
        style: ".bottom-nav { position: relative; margin-top: 0; }",
      });
    }
    await page.getByRole("button", { name: "Ритм суток", exact: true }).click();
    await page
      .getByRole("button", { name: "Расписание 26.09", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "26.09", exact: true })
      .waitFor();
    assert.equal(await page.locator("#screen .child-card").count(),0);
    for (const label of ["Обзор", "Ритм суток", "День → ночь", "Изменения"]) {
      await page.getByRole("button", {name:label, exact:true}).click();
      assert.equal(await page.locator('#screen [data-insight]:not([data-insight="tab"]):not([data-insight="select-day"]):not([data-insight="compare-date"]):not([data-insight="compare-month"])').count(),0);
      assert.equal(await page.locator('#screen form').count(),0);
    }
    await page.evaluate(() => navigate("profile"));
    await page.locator("#toast.visible").waitFor({ state: "hidden" });
    await page.screenshot({
      path: path.join(__dirname, "previews/23-child-profile.png"),
      fullPage: true,
      style: ".bottom-nav { position: relative; margin-top: 0; }",
    });
    await page
      .getByRole("button", { name: "Редактировать профиль малыша" })
      .click();
    await page.screenshot({
      path: path.join(__dirname, "previews/24-child-editor.png"),
    });
    await page.locator("#child-name").fill("Маша");
    await page.locator("#child-sex").selectOption("girl");
    assert.equal(
      await page
        .locator('[name="ageMode"], #child-months, #child-weeks')
        .count(),
      0,
    );
    await page.locator("#child-born").fill("2026-01-03");
    await page.locator("#child-photo").setInputFiles({
      name: "test.png",
      mimeType: "image/png",
      buffer: await readFile(path.join(__dirname, "previews/15-export.png")),
    });
    await page.locator("#photo-preview img").waitFor();
    await page
      .getByRole("button", { name: "Сохранить профиль малыша" })
      .click();
    assert.match(await page.locator(".child-card").innerText(), /Маша/);
    assert.match(
      await page.locator(".child-card").innerText(),
      /9 мес. · Девочка/,
    );
    assert.equal(await page.locator(".child-card img").count(), 1);
    await page
      .getByRole("button", { name: "Редактировать профиль малыша" })
      .click();
    await page.locator("#child-name").fill("Не сохранять");
    await page.keyboard.press("Escape");
    assert.doesNotMatch(
      await page.locator(".child-card").innerText(),
      /Не сохранять/,
    );
    await page
      .getByRole("button", { name: "Редактировать профиль малыша" })
      .click();
    await page
      .getByRole("button", { name: "Удалить фото", exact: true })
      .click();
    await page.locator("#child-name").fill("Саша");
    await page.locator("#child-sex").selectOption("boy");
    await page.locator("#child-born").fill("2026-02-03");
    await page
      .getByRole("button", { name: "Сохранить профиль малыша" })
      .click();
    assert.equal(await page.locator(".child-card img").count(), 0);
    await page.evaluate(() => {
      insights.tab = "overview";
      navigate("statistics");
    });
    await page.locator("#toast.visible").waitFor({ state: "hidden" });
    await page.screenshot({
      path: path.join(__dirname, "previews/14-statistics.png"),
      fullPage: true,
      style: ".bottom-nav { position: relative; margin-top: 0; }",
    });
    await page
      .getByRole("button", { name: "Свой период", exact: true })
      .click();
    await page.locator("#report-from").fill("2026-10-03");
    await page
      .getByRole("button", { name: "Применить период", exact: true })
      .click();
    assert.match(
      await page.locator("#report-error").innerText(),
      /начало не позже/,
    );
    await page.locator("#report-to").fill("2026-10-03");
    await page
      .getByRole("button", { name: "Применить период", exact: true })
      .click();
    assert.match(await page.locator("#screen").innerText(), /0 из 1 циклов/);
    assert.equal(
      await page.locator(".report-metric strong").first().innerText(),
      "—",
    );
    await page
      .getByRole("button", { name: "Последняя неделя", exact: true })
      .click();
    await openReportActions();
    await page
      .getByRole("button", { name: "Скачать CSV", exact: true })
      .click();
    await page.screenshot({
      path: path.join(__dirname, "previews/15-export.png"),
    });
    const downloadPromise = page.waitForEvent("download");
    await page
      .locator("#report-period")
      .getByRole("button", { name: "Скачать CSV", exact: true })
      .click();
    const download = await downloadPromise;
    const csv = await readFile(await download.path(), "utf8");
    assert.match(download.suggestedFilename(), /2026-09-26-2026-10-02/);
    assert.match(csv, /2026-09-26/);
    assert.doesNotMatch(csv, /night_event/);
    assert.doesNotMatch(csv, /"2026-10-03"/);
    assert.doesNotMatch(csv, /"note"/);
    await openReportActions();
    await page.getByRole("button", { name: "Поделиться", exact: true }).click();
    await page.screenshot({
      path: path.join(__dirname, "previews/16-share.png"),
    });
    await page
      .getByRole("button", { name: "Создать публичную ссылку", exact: true })
      .click();
    await page.screenshot({
      path: path.join(__dirname, "previews/17-share-created.png"),
    });
    await page
      .getByRole("button", { name: "Открыть отчёт", exact: true })
      .click();
    assert.equal(await page.locator("#navigation").isVisible(), false);
    assert.equal(await page.locator(".app-header").isVisible(), false);
    assert.match(await page.locator('.child-card').innerText(), /Саша/);
    assert.match(await page.locator('.child-card').innerText(), /8 мес/);
    const avatar = await page.locator('.child-photo').boundingBox();
    assert.ok(Math.abs(avatar.width-avatar.height)<1);

    assert.doesNotMatch(
      await page.locator("#screen").innerText(),
      /anna@|Анна|Девочка|Мальчик|Добавить заметку/,
    );
    await page.screenshot({
      path: path.join(__dirname, "previews/18-public-report.png"),
      fullPage: true,
      style: ".bottom-nav { position: relative; margin-top: 0; }",
    });
    await page.evaluate(() => navigate("statistics"));
    await page.getByRole("button", { name: "30 дней", exact: true }).click();
    await openReportActions();
    await page.getByRole("button", { name: "Поделиться", exact: true }).click();
    assert.match(
      await page.locator("#sheet").innerText(),
      /26.09.2026 — 02.10.2026/,
    );
    await page
      .getByRole("button", { name: "Отозвать ссылку", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Отозвать ссылку", exact: true })
      .click();
    await page.evaluate(() => navigate("public-report"));
    await page.getByRole("heading", { name: "Отчёт недоступен" }).waitFor();
    await page.evaluate(() => navigate("statistics"));
    for (const label of ["Нет данных", "Загрузка", "Ошибка", "Данные"]) {
      await page.locator(".demo-box summary").click();
      await page.getByRole("button", { name: label, exact: true }).click();
    }
    await page
      .getByRole("button", { name: "Последняя неделя", exact: true })
      .click();
    await page.evaluate(() => navigate("profile"));
    await page.locator('[data-report="appearance"]').click();
    await page.getByRole("button", { name: "Тёмная", exact: true }).click();
    await page.evaluate(() => navigate("statistics"));
    await page.locator("#toast.visible").waitFor({ state: "hidden" });
    await page.screenshot({
      path: path.join(__dirname, "previews/19-statistics-dark.png"),
      fullPage: true,
      style: ".bottom-nav { position: relative; margin-top: 0; }",
    });
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await page.getByRole("button", { name: "Ритм суток", exact: true }).click();
    await page.screenshot({
      path: path.join(__dirname, "previews/25-rhythm-dark.png"),
      fullPage: true,
      style: ".bottom-nav { position: relative; margin-top: 0; }",
    });
    await page.getByRole("button", { name: "Обзор", exact: true }).click();
    await page
      .getByRole("button", { name: "Свой период", exact: true })
      .click();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#sheet").isVisible(), false);
    await openReportActions();
    await page
      .getByRole("button", { name: "Скачать CSV", exact: true })
      .click();
    await page.getByRole("checkbox", { name: "Включить заметки" }).check();
    const notesDownload = page.waitForEvent("download");
    await page
      .locator("#report-period")
      .getByRole("button", { name: "Скачать CSV", exact: true })
      .click();
    assert.match(
      await readFile(await (await notesDownload).path(), "utf8"),
      /"note"/,
    );
    await openReportActions();
    await page
      .getByRole("button", { name: "Скачать CSV", exact: true })
      .click();
    await page.locator("#report-from").fill("2026-09-29");
    await page.locator("#report-to").fill("2026-09-29");
    await page
      .locator("#report-period")
      .getByRole("button", { name: "Скачать CSV", exact: true })
      .click();
    assert.match(
      await page.locator("#report-error").innerText(),
      /нет записей/,
    );
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      reporting.theme = "light";
      applyReportTheme();
      insights.tab = "overview";
      navigate("statistics");
    });
    await page.locator("#toast.visible").waitFor({ state: "hidden" });
    await page.evaluate(() => document.activeElement?.blur());
    await page.screenshot({
      path: path.join(__dirname, "previews/26-refined-statistics.png"),
    });
    await page.evaluate(() => navigate("day"));
    await page.screenshot({
      path: path.join(__dirname, "previews/27-refined-today.png"),
    });
    await page.evaluate(() => navigate("statistics"));
    await page
      .getByRole("button", { name: "День → ночь", exact: true })
      .click();
    await page.locator(".compare-day").last().locator("dl").waitFor();
    await page.getByRole("button", { name: "Обзор", exact: true }).click();
    await page
      .getByRole("button", { name: "Свой период", exact: true })
      .click();
    await page.keyboard.press("Escape");
    assert.equal(
      await page
        .getByRole("button", { name: "Свой период", exact: true })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.setViewportSize({ width: 844, height: 390 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    const largeText = await page.addStyleTag({
      content: ":root {font-size:32px !important;}",
    });
    assert.equal(await page.locator("#screen .child-card").count(),0);
    for (const label of ["Обзор", "Ритм суток", "День → ночь", "Изменения"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `200% text: ${label}`,
      );
    }
    await largeText.evaluate((el) => el.remove());
    await page.getByRole("button", { name: "Обзор", exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0,0); });
    await page.screenshot({
      path: path.join(__dirname, "previews/28-refined-desktop.png"),
    });
    assert.deepEqual(errors, []);
    console.log(
      "Passed: responsive layout, range validation, incomplete cycles, CSV content, public snapshot, revocation, states, themes; twelve previews saved; child profile, photo upload/removal, rhythm and read-only statistics verified.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
