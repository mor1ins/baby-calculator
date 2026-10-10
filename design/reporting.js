/* Proposed reporting UI. All data and links are local demonstrations. */
const reporting = {
  from: "2026-09-26",
  to: "2026-10-02",
  view: "ready",
  share: null,
  theme: "auto",
};
const shiftDate = (date, days) =>
  new Date(Date.parse(date + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
const reportSamples = Array.from({ length: 8 }, (_, i) => {
  const date = shiftDate("2026-09-26", i);
  const nap = [90, 105, 80, 0, 100, 95, 90, 80][i];
  return {
    date,
    nap,
    night: i === 7 ? null : 600,
    awake: i === 7 ? null : 840 - nap,
    count: i === 7 ? 1 : 2,
    complete: i !== 7,
  };
}).filter((_, i) => i !== 3);
function reportRows(from = reporting.from, to = reporting.to) {
  return reportSamples.filter((row) => row.date >= from && row.date <= to);
}
function reportPeriod(from, to) {
  return `${from.split("-").reverse().join(".")} — ${to.split("-").reverse().join(".")}`;
}
function reportMetrics(rows) {
  const complete = rows.filter((row) => row.complete);
  const mean = (key) =>
    complete.length
      ? duration(
          Math.round(
            complete.reduce((sum, row) => sum + row[key], 0) / complete.length,
          ),
        )
      : "—";
  return `<div class="report-metrics">${[
    [
      "Всего по записям",
      mean("nap") === "—"
        ? "—"
        : duration(
            Math.round(
              complete.reduce((sum, row) => sum + row.nap + row.night, 0) /
                complete.length,
            ),
          ),
      "дневной сон + ночной интервал",
    ],
    ["Дневной сон", mean("nap"), "в среднем за цикл"],
    ["Ночной интервал", mean("night"), "в среднем за цикл"],
    ["Бодрствование", mean("awake"), "в среднем за цикл"],
    [
      "Дневных снов",
      complete.length
        ? (
            complete.reduce((sum, row) => sum + row.count, 0) / complete.length
          ).toLocaleString("ru", { maximumFractionDigits: 1 })
        : "—",
      "в среднем за цикл",
    ],
  ]
    .map(
      ([label, value, hint]) =>
        `<article class="report-metric"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`,
    )
    .join("")}</div>`;
}
function reportAveragesNote(rows, from, to) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  const complete = rows.filter(row => row.complete).length;
  return `<p class="info-note averages-note">${complete} из ${days} циклов завершены. Средние рассчитаны только по ним; неполные дни и дни без записей исключены.</p>`;
}
function reportBody(rows) {
  if (!rows.length) return '<section class="card empty"><h2>Пока нет записей</h2><p>Выберите другой период. Отсутствие записей не означает отсутствие сна.</p></section>';
  return reportMetrics(rows);
}
function reportActions() {
  modal("Действия со статистикой", `<button class="settings-row" data-report="export" aria-label="Скачать CSV">${icon("download")}<span>Скачать CSV<small>Экспорт записей за период</small></span>${icon("arrow")}</button><button class="settings-row" data-report="share" aria-label="Поделиться">${icon("share")}<span>Поделиться<small>Публичный отчёт по ссылке</small></span>${icon("arrow")}</button>`);
}
function compactReportPeriod() {
  const format = (date) =>
    new Intl.DateTimeFormat("ru", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(date + "T12:00:00Z"));
  return `${format(reporting.from)} — ${format(reporting.to)}${reporting.from.slice(0, 4) !== reporting.to.slice(0, 4) ? ` · ${reporting.from.slice(0, 4)}–${reporting.to.slice(0, 4)}` : ` · ${reporting.to.slice(0, 4)}`}`;
}
function statisticsPage() {
  return (
    head("Статистика", "Замечайте ритм, день за днём", `<button class="icon-button" data-report="actions" aria-label="Действия со статистикой"><span aria-hidden="true">⋯</span></button>`) +
    `<section class="card period-card"><span class="kicker">ПЕРИОД СТАТИСТИКИ</span><button class="period-button" data-report="period">${compactReportPeriod()} ${icon("calendar")}</button><div class="chips">${[7, 30].map((days) => `<button data-report="preset" data-days="${days}" aria-pressed="${reporting.to === "2026-10-02" && reporting.from === shiftDate("2026-10-03", -days)}">${days === 7 ? "Последняя неделя" : "30 дней"}</button>`).join("")}<button data-report="period">Свой период</button></div><p class="form-note">${reporting.from === "2026-09-26" && reporting.to === "2026-10-02" ? "7 календарных дат до сегодня · " : "Даты циклов включительно · "}Москва</p></section>
    ${insightNavigation()}
    ${reporting.view === "loading" ? '<div class="card" role="status">Загружаем статистику…</div>' : reporting.view === "error" ? '<div class="card" role="alert"><h2>Не удалось загрузить</h2><p>Период сохранён. Попробуйте ещё раз.</p><button class="outline-button" data-report="ready">Повторить</button></div>' : insightContent(reporting.view === "empty" ? [] : reportRows(), reporting.from, reporting.to)}
    <details class="demo-box"><summary>Состояния макета</summary><p class="subtle">Отдельный пример недели. Не связан с изменениями демонстрационного дневника.</p><div class="chips">${[
      ["ready", "Данные"],
      ["empty", "Нет данных"],
      ["loading", "Загрузка"],
      ["error", "Ошибка"],
    ]
      .map(([key, label]) => `<button data-report="${key}">${label}</button>`)
      .join("")}</div></details>`
  );
}
function periodSheet(forExport = false) {
  modal(
    forExport ? "Экспорт данных" : "Выбрать период",
    `<form id="report-period" data-export="${forExport}"><p class="subtle">Даты циклов включительно · Europe/Moscow</p><label for="report-from">С</label><input id="report-from" name="from" type="date" required max="2026-10-03" value="${reporting.from}"><label for="report-to">По</label><input id="report-to" name="to" type="date" required max="2026-10-03" value="${reporting.to}">${forExport ? '<p class="info-note">CSV: фактические интервалы сна. Открытый сон — без окончания и длительности. Прогнозы не выгружаются.</p><label class="export-check"><input name="notes" type="checkbox"> Включить заметки</label><p class="form-note">Заметки могут содержать личную информацию. UTF-8 · разделитель «;».</p>' : ""}<p id="report-error" class="error" role="alert"></p><button class="primary" type="submit">${forExport ? "Скачать CSV" : "Применить период"}</button></form>`,
  );
}
function shareSheet() {
  const share = reporting.share;
  const ready = share && !share.revoked;
  modal(
    ready ? "Ссылка на статистику" : "Поделиться статистикой",
    `<div class="share-panel"><p class="share-period">${reportPeriod(ready ? share.from : reporting.from, ready ? share.to : reporting.to)}</p>${ready
      ? `<div class="share-address"><span id="share-url">https://example.invalid/s/${share.token}</span><button class="icon-button share-copy" data-report="copy" aria-label="Скопировать ссылку" title="Скопировать ссылку">${icon("copy")}</button></div><button class="text-button share-preview" data-report="preview">Открыть отчёт ${icon("arrow")}</button><div class="share-footer"><span>Демо · ссылка не опубликована</span><button class="text-button danger" data-report="revoke">Отозвать ссылку</button></div>`
      : `<p class="share-description">Фото, имя малыша и статистика за выбранный период будут доступны всем, у кого есть ссылка.</p><p class="share-description subtle">Без личных заметок. Новые записи в отчёт не попадут. Доступ можно отозвать.</p><button class="primary" data-report="create-share" ${!reportRows().length || reporting.view !== "ready" ? "disabled" : ""}>Создать публичную ссылку</button><p class="share-demo">Демо · без публикации в интернете</p>`}</div>`,
  );
}
function publicChildCard(child) {
  if (!child) return "";
  return `<section class="child-card"><div class="child-photo">${child.photo ? `<img src="${escapeText(child.photo)}" alt="Фото малыша">` : `<span aria-hidden="true">${escapeText(child.name.slice(0,1))}</span>`}</div><div><h2>${escapeText(child.name || "Малыш")}</h2><p>${escapeText(child.age)}</p></div></section>`;
}
function publicReportPage() {
  const share = reporting.share;
  if (!share || share.revoked)
    return (
      head("Отчёт недоступен", "Ссылка отозвана или не существует.") +
      '<p class="info-note">Попросите отправителя поделиться новой ссылкой.</p>'
    );
  return (
    '<span class="badge">Публичный отчёт · только просмотр</span>' +
    publicChildCard(share.child) +
    `<div class="public-export-actions"><button class="outline-button" data-report="public-export">${icon("download")}Скачать CSV</button></div>` +
    '<div class="public-report-heading">' +
    head("Ритм сна", reportPeriod(share.from, share.to)) +
    '<p class="subtle public-snapshot">Снимок на 3 октября 2026, 14:20 · Москва</p></div>' +
    insightNavigation() +
    insightContent(share.rows, share.from, share.to, share.changes)
  );
}
function downloadReport(from, to, notes, rows = reportRows(from, to)) {
  if (!rows.length) return false;
  const data = [
    [
      "cycle_date",
      "timezone",
      "type",
      "start",
      "end",
      "duration_minutes",
      ...(notes ? ["note"] : []),
    ],
  ];
  const add = (day, type, start, end, minutes) =>
    data.push([
      day.date,
      "Europe/Moscow",
      type,
      start,
      end,
      minutes,
      ...(notes ? [type === "nap" ? "Пример заметки" : ""] : []),
    ]);
  const instant = (date, minutes) =>
    `${shiftDate(date, Math.floor(minutes / 1440))}T${time(minutes)}:00+03:00`;
  for (const row of rows) {
    for (const [start, end] of row.naps)
      add(
        row,
        "nap",
        instant(row.date, start),
        instant(row.date, end),
        end - start,
      );
    if (row.nightStart !== null)
      add(
        row,
        "night",
        instant(row.date, row.nightStart),
        instant(row.date, 1830),
        row.night,
      );
  }
  const cell = (value) =>
    '"' +
    String(value)
      .replace(/^[=+\-@\t\r]/, (match) => "'" + match)
      .replaceAll('"', '""') +
    '"';
  const url = URL.createObjectURL(
    new Blob(
      ["\ufeff" + data.map((row) => row.map(cell).join(";")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `tishe-demo-${from}-${to}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-report]");
  if (!button) return;
  const action = button.dataset.report;
  if (action === "actions") reportActions();
  if (action === "public-export") {
    const share = reporting.share;
    if (!share || share.revoked) return;
    downloadReport(share.from, share.to, false, share.rows);
    return;
  }
  if (["ready", "empty", "loading", "error"].includes(action)) {
    reporting.view = action;
    render();
  }
  if (action === "period" || action === "export")
    periodSheet(action === "export");
  if (action === "preset") {
    reporting.from = shiftDate("2026-10-03", -Number(button.dataset.days));
    reporting.to = "2026-10-02";
    reporting.view = "ready";
    render();
  }
  if (action === "share") shareSheet();
  if (action === "create-share") {
    try {
    reporting.share = {
      from: reporting.from,
      to: reporting.to,
      child: {name: insights.child.name, age: childAge(), photo: insights.child.photo},
      rows: reportRows().map(
        ({ date, nap, night, awake, count, complete, morning, nightStart, settleStart, settling, naps, lastWake, settlingHelp, mood }) => ({
          date,
          nap,
          night,
          awake,
          count,
          complete,
          morning, nightStart, settleStart, settling, lastWake, settlingHelp, mood,
          naps: naps.map(interval => [...interval]),
          context: "",
        }),
      ),
      changes: insights.changes.filter(item => item.date >= reporting.from && item.date <= reporting.to).map(({id,date,text}) => ({id,date,text})),
      token: Math.random().toString(36).slice(2, 9),
      revoked: false,
    };
    publicInsights.tab = "overview";
    publicInsights.selected = null;
    shareSheet();
    } catch (error) {
      reporting.share = null;
      console.error("Unable to create report snapshot", error);
      let message = document.querySelector("#share-create-error");
      if (!message) {
        message = document.createElement("p");
        message.id = "share-create-error";
        message.className = "error";
        message.setAttribute("role", "alert");
        button.before(message);
      }
      message.textContent = "Не удалось создать ссылку. Обновите страницу и попробуйте ещё раз.";
      message.scrollIntoView({block:"nearest"});
    }
  }
  if (action === "preview") {
    sheet.close();
    navigate("public-report");
  }
  if (action === "revoke")
    modal(
      "Отозвать ссылку?",
      '<p>Отчёт перестанет открываться по прежнему адресу. Уже сохранённые получателем копии останутся у него.</p><button class="primary" data-report="confirm-revoke">Отозвать ссылку</button><button class="outline-button" data-report="share">Отмена</button>',
    );
  if (action === "confirm-revoke") {
    reporting.share.revoked = true;
    sheet.close();
    toast("Ссылка отозвана в макете");
  }
  if (action === "copy") {
    const link = document.querySelector("#share-url");
    if (!link) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(link.textContent);
      copied = true;
    } catch {
      // Local HTTP previews may not expose the Clipboard API.
      const field = document.createElement("textarea");
      field.value = link.textContent;
      field.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      sheet.append(field);
      field.select();
      try { copied = document.execCommand("copy"); } catch {}
      field.remove();
      button.focus({preventScroll:true});
    }
    if (copied) {
      button.innerHTML = icon("check");
      button.setAttribute("aria-label", "Ссылка скопирована");
      setTimeout(() => {
        if (!button.isConnected) return;
        button.innerHTML = icon("copy");
        button.setAttribute("aria-label", "Скопировать ссылку");
      }, 2000);
      toast("Пример ссылки скопирован");
    } else {
      const range = document.createRange();
      range.selectNodeContents(link);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      toast("Выделена ссылка — скопируйте вручную");
    }
  }
});
document.addEventListener("submit", (event) => {
  if (event.target.id !== "report-period") return;
  event.preventDefault();
  const form = event.target,
    values = new FormData(form);
  const from = values.get("from"),
    to = values.get("to");
  const error = document.querySelector("#report-error");
  if (!from || !to || from > to || to > "2026-10-03") {
    error.textContent =
      "Укажите период: начало не позже окончания, даты не в будущем.";
    return;
  }
  if ((Date.parse(to) - Date.parse(from)) / 86400000 >= 366) {
    error.textContent = "Выберите не более 366 дней.";
    return;
  }
  if (form.dataset.export === "true") {
    if (!downloadReport(from, to, values.has("notes"))) {
      error.textContent = "За этот период нет записей для экспорта.";
      return;
    }
    sheet.close();
    toast("CSV с демонстрационными данными подготовлен");
  } else {
    reporting.from = from;
    reporting.to = to;
    reporting.view = "ready";
    sheet.close();
    render();
  }
});
function themeControls() {
  const labels = {auto:"Как на устройстве", light:"Светлая", dark:"Тёмная"};
  return `<button class="settings-row" data-report="appearance">${icon("sun")}<span>Оформление<small>${labels[reporting.theme]}</small></span>${icon("arrow")}</button>`;
}
function appearanceSheet() {
  modal("Оформление", `<div class="appearance-options" role="group" aria-label="Выбор темы">${[
    ["auto", "Как на устройстве", "sliders"],
    ["light", "Светлая", "sun"],
    ["dark", "Тёмная", "moon"],
  ].map(([value,label,symbol]) => `<button class="settings-row" data-theme-choice="${value}" aria-pressed="${reporting.theme === value}">${icon(symbol)}<span>${label}</span>${reporting.theme === value ? icon("check") : ""}</button>`).join("")}</div>`);
}
const themePreference = matchMedia("(prefers-color-scheme: dark)");
function applyReportTheme() {
  document.documentElement.dataset.theme =
    reporting.theme === "auto"
      ? themePreference.matches
        ? "dark"
        : "light"
      : reporting.theme;
  window.mobileUI?.refreshTheme();
}
applyReportTheme();
themePreference.addEventListener("change", applyReportTheme);
document.addEventListener("click", (event) => {
  if (event.target.closest('[data-report="appearance"]')) appearanceSheet();
  const choice = event.target.closest("[data-theme-choice]");
  if (choice) {
    reporting.theme = choice.dataset.themeChoice;
    applyReportTheme();
    sheet.close();
    render();
  }
  if (event.target.closest('[data-report="profile"]'))
    modal(
      "Личные данные",
      '<label for="demo-name">Ваше имя</label><input id="demo-name" value="Анна Смирнова"><p class="info-note">Демонстрационные данные. В приложении эти настройки сохраняются в профиле.</p><button class="primary" data-action="close">Готово</button>',
    );
});
