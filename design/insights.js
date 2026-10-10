/* Optional design proposal. Fixed examples, no API or persistence. */
const insights = {
  tab: "overview",
  selected: "2026-10-02",
  child: {
    name: "Саша",
    born: "2026-02-03",
    sex: "boy",
    photo: "",
    context:
      "Трудности появились около двух недель назад. До этого укладывание было короче.",
    premature: "Нет",
    feeding: "Грудное вскармливание и прикорм",
    environment: "Кроватка в комнате родителей. Темно, тихо.",
    health: "",
  },
  changes: [
    { date: "2026-09-30", text: "Начали вечернее укладывание раньше", id: 1 },
  ],
  nextId: 2,
  photoDraft: "",
  photoBusy: false,
  photoGeneration: 0,
};
for (const [index, row] of reportSamples.entries()) {
  const nightStart = [1250, 1270, 1260, 1230, 1220, 1230, 1230][index];
  const latency = [35, 45, 30, 20, 15, 20, null][index];
  row.morning = 390;
  row.nightStart = row.complete ? nightStart : null;
  row.settleStart = row.complete ? nightStart - latency : null;
  row.settling = latency;
  row.naps =
    row.count === 2
      ? [
          [600, 660],
          [900, 900 + row.nap - 60],
        ]
      : [[650, 730]];
  row.night = row.complete ? 1830 - nightStart : null;
  row.awake = row.complete ? nightStart - row.morning - row.nap : null;
  row.lastWake = row.complete ? nightStart - row.naps.at(-1)[1] : null;
  row.settlingHelp =
    index < 3 ? "Укачивание на руках" : "На руках, затем в кроватку";
  row.mood = index < 3 ? "Беспокоился" : "Спокойно";
  row.context = index === 1 ? "Поздно вернулись с прогулки" : "";
}
const shortDate = (date) => date.slice(8) + "." + date.slice(5, 7);
function childAge() {
  const child = insights.child;
  const birthday = new Date(child.born + "T12:00:00Z"),
    now = new Date("2026-10-03T12:00:00Z");
  const months =
    (now.getUTCFullYear() - birthday.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    birthday.getUTCMonth() -
    (now.getUTCDate() < birthday.getUTCDate() ? 1 : 0);
  if (months >= 12) {
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    return `${years} г.${remainingMonths ? ` ${remainingMonths} м.` : ""}`;
  }
  return months > 0
    ? `${months} мес.`
    : `${Math.floor((now - birthday) / 604800000)} нед.`;
}
function childPhoto(photo = insights.child.photo) {
  return photo
    ? `<img src="${escapeText(photo)}" alt="Фото малыша">`
    : `<span aria-hidden="true">${escapeText(insights.child.name.slice(0, 1) || "◔")}</span>`;
}
function childCard(profile = false, readonly = false) {
  const child = insights.child;
  return `<section class="child-card ${profile ? "child-card-profile" : ""}">${readonly ? `<div class="child-photo">${childPhoto()}</div>` : `<button class="child-photo" data-insight="child" aria-label="Изменить фото малыша">${childPhoto()}</button>`}<div><span class="kicker">ВАШ МАЛЫШ</span><h2>${escapeText(child.name || "Малыш")}</h2><p>${childAge()}${child.sex === "unknown" ? "" : " · " + (child.sex === "boy" ? "Мальчик" : "Девочка")}</p></div>${readonly ? "" : `<button class="icon-button" data-insight="child" aria-label="Редактировать профиль малыша">${icon("sliders")}</button>`}</section>${profile ? '<button class="outline-button" data-insight="context">О малыше и привычках сна</button>' : ""}`;
}
function childSheet() {
  const child = insights.child;
  insights.photoDraft = child.photo;
  insights.photoGeneration++;
  modal(
    "Профиль малыша",
    `<form id="child-form"><div class="photo-editor"><div class="child-photo photo-large" id="photo-preview">${childPhoto()}</div><div><label for="child-photo" class="photo-upload">Добавить фото</label><input class="photo-file" id="child-photo" type="file" accept="image/jpeg,image/png,image/webp"><button type="button" class="text-button" data-insight="remove-photo">Удалить фото</button></div></div><p class="form-note">JPG, PNG или WebP, до 5 МБ. Фото остаётся только в этом макете.</p><label for="child-name">Имя малыша</label><input id="child-name" name="name" maxlength="40" value="${escapeText(child.name)}" required><label for="child-born">Дата рождения</label><input id="child-born" name="born" type="date" required max="2026-10-03" value="${child.born}"><p class="form-note">Возраст рассчитывается автоматически по дате рождения.</p><label for="child-sex">Пол</label><select id="child-sex" name="sex"><option value="unknown" ${child.sex === "unknown" ? "selected" : ""}>Не указан</option><option value="boy" ${child.sex === "boy" ? "selected" : ""}>Мальчик</option><option value="girl" ${child.sex === "girl" ? "selected" : ""}>Девочка</option></select><p class="form-note">Имя, возраст и фото будут видны в публичном отчёте. Пол и дата рождения в него не включаются.</p><p class="error" id="child-error" role="alert"></p><button type="submit" class="primary">Сохранить профиль малыша</button><button type="button" class="text-button add-past" data-action="close">Отмена</button></form>`,
  );
}
function contextSheet() {
  const child = insights.child;
  modal(
    "О малыше и привычках сна",
    `<form id="child-context-form"><p class="subtle">Можно заполнить только то, что хочется сохранить.</p>${[
      ["context", "Когда изменился сон и каким был раньше"],
      ["premature", "Недоношенность / срок рождения"],
      ["feeding", "Кормление"],
      ["environment", "Где и в каких условиях спит"],
      ["health", "Самочувствие и особенности здоровья"],
    ]
      .map(
        ([key, label]) =>
          `<label for="context-${key}">${label}</label><textarea id="context-${key}" name="${key}" maxlength="600">${escapeText(child[key])}</textarea>`,
      )
      .join(
        "",
      )}<p class="form-note">Личные заметки. Не включаются в публичную ссылку.</p><button class="primary" type="submit">Сохранить сведения</button></form>`,
  );
}
const publicInsights = {tab:"overview", selected:null};
function insightView() { return state.route === "public-report" ? publicInsights : insights; }
function insightNavigation() {
  return `<div class="insight-tabs" role="group" aria-label="Разделы статистики">${[
    ["overview", "Обзор"],
    ["rhythm", "Ритм суток"],
    ["compare", "День → ночь"],
    ["changes", "Изменения"],
  ]
    .map(
      ([key, label]) =>
        `<button data-insight="tab" data-tab="${key}" aria-pressed="${insightView().tab === key}">${label}</button>`,
    )
    .join("")}</div>`;
}
function insightDuration(minutes) {
  return minutes < 60 ? `${minutes} мин` : duration(minutes);
}
function average(rows, key, format = true) {
  const values = rows
    .map((row) => row[key])
    .filter((value) => value !== null && value !== undefined);
  if (!values.length) return "—";
  const value = Math.round(
    values.reduce((sum, item) => sum + item, 0) / values.length,
  );
  return format ? insightDuration(value) : value;
}
function rangeLabel(rows, key) {
  const values = rows
    .map((row) => row[key])
    .filter((value) => value !== null && value !== undefined);
  return values.length
    ? `${insightDuration(Math.min(...values))} — ${insightDuration(Math.max(...values))}`
    : "—";
}
function insightSummary(rows) {
  return `<div class="insight-highlights"><article><span>Перед ночью</span><strong>${average(rows, "lastWake")}</strong><small>среднее бодрствование</small><small>Разброс: ${rangeLabel(rows, "lastWake")}</small></article><article><span>Укладывание</span><strong>${average(rows, "settling")}</strong><small>в среднем до засыпания</small><small>Разброс: ${rangeLabel(rows, "settling")}</small></article></div>`;
}
function insightContent(rows, from, to, changes = insights.changes) {
  if (!rows.length) return reportBody(rows, from, to);
  if (insightView().tab === "overview")
    return reportAveragesNote(rows, from, to) + insightSummary(rows) + reportBody(rows);
  if (insightView().tab === "rhythm") return rhythmPanel(rows, from, to);
  if (insightView().tab === "compare") return comparePanel(rows, from, to);
  return changesPanel(rows, from, to, changes);
}
function rhythmPanel(rows, from, to) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  const selected =
    rows.find((row) => row.date === insightView().selected) || rows.at(-1);
  insightView().selected = selected.date;
  const bar = (start, end, kind) =>
    `<i class="rhythm-bar ${kind}" style="left:${(start - 390) / 14.4}%;width:${(end - start) / 14.4}%"></i>`;
  return `<div class="section-head"><h2>Каждые сутки рядом</h2><span>06:30 → 06:30</span></div><p class="subtle">Выберите строку, чтобы рассмотреть день.</p><section class="card rhythm-card"><div class="rhythm-legend"><span class="nap-dot">Днём</span><span class="night-dot">Ночной интервал</span></div><div class="rhythm-axis"><span>06:30</span><span>12:30</span><span>18:30</span><span>00:30</span><span>06:30</span></div><div class="rhythm-rows">${Array.from(
    { length: days },
    (_, i) => {
      const date = shiftDate(from, i),
        row = rows.find((item) => item.date === date);
      return `<button class="rhythm-row" data-insight="select-day" data-date="${date}" ${!row ? "disabled" : ""} aria-pressed="${date === selected.date}" aria-label="Расписание ${shortDate(date)}"><span>${shortDate(date)}</span><span class="rhythm-track">${row ? row.naps.map(([start, end]) => bar(start, end, "nap")).join("") + (row.nightStart !== null ? bar(row.settleStart, row.nightStart, "settling") + bar(row.nightStart, 1830, "night") : "") : "<small>Нет записей</small>"}</span></button>`;
    },
  ).join(
    "",
  )}</div><p class="form-note">Штриховка — укладывание. Ночь продолжается на следующую дату.</p></section>${dayDetail(selected)}`;
}
function wakeWindows(row) {
  let previous = row.morning;
  const windows = [];
  row.naps.forEach(([start, end]) => {
    windows.push([previous, start]);
    previous = end;
  });
  if (row.nightStart !== null) windows.push([previous, row.nightStart]);
  return windows;
}
function dayDetail(row) {
  const windows = wakeWindows(row);
  const interval = (label, start, end, nap = false) => `<li${nap ? ' class="nap-item"' : ''}><span>${label}<small>${time(start)}–${time(end)}</small></span><strong>${duration(end - start)}</strong></li>`;
  const lastEnd = row.naps.at(-1)?.[1] ?? row.morning;
  return `<section class="card daily-detail compact-day"><h2>${shortDate(row.date)}</h2><p class="day-boundaries">Подъём <strong>${time(row.morning)}</strong><span aria-hidden="true">·</span>Ночь <strong>${row.nightStart === null ? "—" : time(row.nightStart)}</strong></p><ol class="daily-sequence">${row.naps.map(([start, end], i) => interval("Бодрствование", windows[i][0], start) + interval(`Сон ${i + 1}`, start, end, true)).join("")}${row.nightStart === null ? "<li><span>День продолжается</span></li>" : interval("Перед ночью", lastEnd, row.nightStart)}</ol><div class="settling-summary"><div><span>Укладывание</span><strong>${row.settling === null ? "—" : `${row.settling} мин`}</strong></div>${row.settling === null ? '<p>Пока не записано</p>' : `<p>${time(row.settleStart)}–${time(row.nightStart)} · ${escapeText(row.settlingHelp)} · ${escapeText(row.mood)}</p>`}</div>${row.context ? `<p class="info-note">${escapeText(row.context)}</p>` : ""}</section>`;
}
function settlingSheet(date) {
  const row = reportSamples.find((item) => item.date === date);
  modal(
    "Вечернее укладывание",
    `<form id="settling-form" data-date="${date}"><p class="subtle">${shortDate(date)} · фактическое засыпание ${row.nightStart === null ? "ещё не записано" : time(row.nightStart)}</p>${row.nightStart === null ? '<p class="info-note">После записи ночного сна можно указать начало укладывания.</p>' : `<label for="settle-start">Начали укладывать</label><input id="settle-start" name="start" type="time" required value="${time(row.settleStart)}"><p class="form-note">Длительность рассчитается до записанного засыпания.</p><label for="settle-help">Как помогали заснуть</label><input id="settle-help" name="help" maxlength="120" value="${escapeText(row.settlingHelp)}"><label for="settle-mood">Как проходило укладывание</label><select id="settle-mood" name="mood">${["Спокойно", "Беспокоился", "Не указано"].map((value) => `<option ${row.mood === value ? "selected" : ""}>${value}</option>`).join("")}</select><p class="error" id="settling-error" role="alert"></p><button class="primary" type="submit">Сохранить укладывание</button>`}</form>`,
  );
}
function comparisonCalendar(rows, from, to) {
  const view = insightView();
  const firstMonth = from.slice(0,7), lastMonth = to.slice(0,7);
  let month = view.compareMonth || (rows.at(-1)?.date || to).slice(0,7);
  if (month < firstMonth || month > lastMonth) month = lastMonth;
  view.compareMonth = month;
  const inMonth = rows.filter(row => row.date.startsWith(month));
  const selected = inMonth.find(row => row.date === view.compareSelected) || inMonth.at(-1);
  view.compareSelected = selected?.date || null;
  const date = new Date(month+"-01T12:00:00Z");
  const offset = (date.getUTCDay()+6)%7;
  const count = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  const monthLabel = new Intl.DateTimeFormat('ru',{month:'long',year:'numeric',timeZone:'UTC'}).format(date);
  const adjacent = delta => new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+delta,1)).toISOString().slice(0,7);
  return `<section class="card compare-calendar" aria-label="Выбор дня для сравнения"><div class="compare-month"><button class="icon-button" data-insight="compare-month" data-month="${adjacent(-1)}" aria-label="Предыдущий месяц" ${month===firstMonth?'disabled':''}>${icon("back")}</button><h3>${monthLabel}</h3><button class="icon-button" data-insight="compare-month" data-month="${adjacent(1)}" aria-label="Следующий месяц" ${month===lastMonth?'disabled':''}>${icon("arrow")}</button></div><div class="weekdays">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(day=>`<span>${day}</span>`).join('')}</div><div class="compare-calendar-grid">${'<span></span>'.repeat(offset)}${Array.from({length:count},(_,i)=>{
    const day=month+'-'+String(i+1).padStart(2,'0');
    const recorded=inMonth.some(row=>row.date===day);
    const outside=day<from||day>to;
    return `<button data-insight="compare-date" data-date="${day}" ${recorded?'':'disabled'} aria-pressed="${day===view.compareSelected}" aria-label="${shortDate(day)}${outside?' · вне периода':recorded?' · показатели дня':' · нет записей'}">${i+1}${recorded?'<i aria-hidden="true"></i>':''}</button>`;
  }).join('')}</div><p class="form-note">Доступны дни с записями за выбранный период.</p></section>${selected ? comparisonDay(selected) : '<p class="info-note">В этом месяце нет записей за выбранный период.</p>'}`;
}
function comparisonDay(row) {
  return `<section class="compare-day"><h3>${shortDate(row.date)} · день → следующая ночь</h3><dl>${[
    ["Дневной сон", duration(row.nap)],
    ["Конец последнего сна", time(row.naps.at(-1)[1])],
    ["Бодрствование перед ночью", row.lastWake === null ? "—" : duration(row.lastWake)],
    ["Укладывание", row.settling === null ? "—" : row.settling + " мин"],
    ["Засыпание на ночь", row.nightStart === null ? "—" : time(row.nightStart)],
    ["Ночной интервал", row.night === null ? "—" : duration(row.night)],
  ].map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl></section>`;
}
function comparePanel(rows, from, to) {
  return `<div class="section-head"><h2>День → следующая ночь</h2></div><p class="subtle">Что предшествовало каждой ночи. Сравнивайте дни без автоматических выводов о причинах.</p>${comparisonCalendar(rows, from, to)}`;
}
function changesPanel(rows, from, to, changes) {
  const entries = changes.filter(
    (item) => item.date >= from && item.date <= to,
  );
  return `<div class="section-head"><h2>Что меняли в режиме</h2></div><p class="subtle">Изменения режима и сравнение соседних ночей.</p>${
    entries.length
      ? entries
          .map((entry) => {
            const before = rows
              .filter((row) => row.date < entry.date)
              .slice(-3);
            const after = rows
              .filter((row) => row.date >= entry.date)
              .slice(0, 3);
            const values = (items, key) => average(items, key);
            return `<article class="card change-card"><span class="badge">${shortDate(entry.date)}</span><h2>${escapeText(entry.text)}</h2><div class="change-comparison"><span></span><strong>До · ${before.length} дн.</strong><strong>После · ${after.length} дн.</strong>${[
              ["Укладывание", "settling"],
              ["Перед ночью", "lastWake"],
            ]
              .map(
                ([label, key]) =>
                  `<span>${label}</span><b>${values(before, key)}</b><b>${values(after, key)}</b>`,
              )
              .join(
                "",
              )}</div></article>`;
          })
          .join("")
      : '<section class="card"><h2>Пока без отметок изменений</h2><p class="subtle">За выбранный период нет записей об изменениях режима.</p></section>'
  }<p class="info-note">Совпадение по времени не доказывает, что сон изменился именно из-за этого действия.</p>`;
}
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-insight]");
  if (!button) return;
  const action = button.dataset.insight;
  if (["statistics", "public-report"].includes(state.route) && !["tab", "select-day", "compare-date", "compare-month"].includes(action)) return;
  if (action === "child") childSheet();
  if (action === "context") contextSheet();
  if (action === "remove-photo") {
    insights.photoGeneration++;
    if (insights.photoDraft !== insights.child.photo)
      URL.revokeObjectURL(insights.photoDraft);
    insights.photoDraft = "";
    insights.photoBusy = false;
    document.querySelector('#child-form [type="submit"]').disabled = false;
    document.querySelector("#photo-preview").innerHTML =
      '<span aria-hidden="true">◔</span>';
    document.querySelector("#child-photo").value = "";
  }
  if (action === "tab") {
    insightView().tab = button.dataset.tab;
    render();
    document
      .querySelector(`[data-tab="${insightView().tab}"]`)
      ?.focus({ preventScroll: true });
  }
  if (action === "select-day") {
    insightView().selected = button.dataset.date;
    render();
    document
      .querySelector(`[data-date="${insightView().selected}"]`)
      ?.focus({ preventScroll: true });
  }
  if (action === "compare-month") {
    insightView().compareMonth = button.dataset.month;
    render();
    document.querySelector('.compare-month button:not(:disabled)')?.focus({preventScroll:true});
  }
  if (action === "compare-date") {
    insightView().compareSelected = button.dataset.date;
    render();
    document.querySelector(`[data-insight="compare-date"][data-date="${button.dataset.date}"]`)?.focus({preventScroll:true});
  }
  if (action === "settling") settlingSheet(button.dataset.date);
  if (action === "day-context") {
    const row = reportSamples.find((row) => row.date === button.dataset.date);
    modal(
      "Обстоятельства дня",
      `<form id="day-context-form" data-date="${row.date}"><p class="subtle">${shortDate(row.date)}</p><label for="day-context">Что стоит учесть</label><textarea id="day-context" name="context" maxlength="600" placeholder="Самочувствие, лекарства, поездка, необычная обстановка…">${escapeText(row.context)}</textarea><button class="primary" type="submit">Сохранить заметку дня</button></form>`,
    );
  }
  if (action === "add-change")
    modal(
      "Изменение режима",
      `<form id="change-form"><label for="change-date">Начиная с даты</label><input id="change-date" name="date" type="date" required min="${reporting.from}" max="${reporting.to}" value="${reporting.to}"><label for="change-text">Что изменили</label><textarea id="change-text" name="text" required maxlength="200" placeholder="Например, начали укладывать на 15 минут раньше"></textarea><button class="primary" type="submit">Добавить изменение</button></form>`,
    );
  if (action === "delete-change")
    modal(
      "Удалить отметку изменения?",
      `<p>Записи сна останутся на месте.</p><button class="primary" data-insight="confirm-delete-change" data-id="${button.dataset.id}">Удалить отметку</button><button class="text-button add-past" data-action="close">Отмена</button>`,
    );
  if (action === "confirm-delete-change") {
    insights.changes = insights.changes.filter(
      (item) => item.id !== Number(button.dataset.id),
    );
    sheet.close();
    render();
  }
});
document.addEventListener("change", async (event) => {
  if (event.target.id !== "child-photo") return;
  const file = event.target.files[0],
    generation = ++insights.photoGeneration;
  if (!file) return;
  const error = document.querySelector("#child-error");
  error.textContent = "";
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  ) {
    error.textContent = "Выберите JPG, PNG или WebP размером до 5 МБ.";
    return;
  }
  const submit = document.querySelector('#child-form [type="submit"]');
  submit.disabled = true;
  insights.photoBusy = true;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (
      generation !== insights.photoGeneration ||
      !document.querySelector("#photo-preview") ||
      !document.querySelector("#sheet").open
    ) {
      URL.revokeObjectURL(url);
      return;
    }
    if (insights.photoDraft !== insights.child.photo)
      URL.revokeObjectURL(insights.photoDraft);
    insights.photoDraft = url;
    document.querySelector("#photo-preview").innerHTML = childPhoto(url);
  } catch {
    URL.revokeObjectURL(url);
    if (generation === insights.photoGeneration)
      error.textContent =
        "Не удалось открыть изображение. Выберите другой файл.";
  } finally {
    if (generation === insights.photoGeneration) {
      insights.photoBusy = false;
      submit.disabled = false;
    }
  }
});
document.addEventListener("submit", (event) => {
  const form = event.target;
  if (
    ![
      "child-form",
      "child-context-form",
      "settling-form",
      "day-context-form",
      "change-form",
    ].includes(form.id)
  )
    return;
  event.preventDefault();
  const data = new FormData(form);
  if (form.id === "child-form") {
    if (insights.photoBusy) return;
    const name = data.get("name").trim();
    if (!name || !data.get("born") || data.get("born") > "2026-10-03") {
      document.querySelector("#child-error").textContent =
        "Укажите имя и корректную дату рождения.";
      return;
    }
    if (insights.child.photo !== insights.photoDraft && reporting.share?.child?.photo !== insights.child.photo)
      URL.revokeObjectURL(insights.child.photo);
    Object.assign(insights.child, {
      name,
      sex: data.get("sex"),
      photo: insights.photoDraft,
      born: data.get("born"),
    });
  }
  if (form.id === "child-context-form")
    for (const [key, value] of data) insights.child[key] = value.trim();
  if (form.id === "settling-form") {
    const row = reportSamples.find((row) => row.date === form.dataset.date),
      [hours, minutes] = data.get("start").split(":").map(Number),
      start = hours * 60 + minutes;
    if (start > row.nightStart || start < row.naps.at(-1)[1]) {
      document.querySelector("#settling-error").textContent =
        "Начало укладывания должно быть после последнего дневного сна и не позже засыпания.";
      return;
    }
    Object.assign(row, {
      settleStart: start,
      settling: row.nightStart - start,
      settlingHelp: data.get("help").trim(),
      mood: data.get("mood"),
    });
  }
  if (form.id === "day-context-form")
    reportSamples.find((row) => row.date === form.dataset.date).context = data
      .get("context")
      .trim();
  if (form.id === "change-form") {
    if (!data.get("text").trim()) return;
    insights.changes.push({
      date: data.get("date"),
      text: data.get("text").trim(),
      id: insights.nextId++,
    });
    insights.changes.sort((a, b) => a.date.localeCompare(b.date));
  }
  sheet.close();
  render();
  toast("Сохранено в макете");
});

// Closing a draft discards its local image and pending decode result.
document.querySelector("#sheet").addEventListener("close", () => {
  insights.photoGeneration++;
  insights.photoBusy = false;
  if (insights.photoDraft !== insights.child.photo)
    URL.revokeObjectURL(insights.photoDraft);
  insights.photoDraft = insights.child.photo;
});
