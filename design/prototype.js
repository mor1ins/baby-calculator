/* Presentation-only prototype. No API, account creation or persistent storage. */
const paths = {
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  chart: '<path d="M4 3v18h17M8 16v-4m5 4V7m5 9v-7"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  share: '<path d="M12 16V3m-4 4 4-4 4 4M5 13v8h14v-8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
  moon: '<path d="M20.5 14.3A9 9 0 0 1 9.7 3.5 9 9 0 1 0 20.5 14.3Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 5h2m4 0h2"/>',
  sliders:
    '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  note: '<path d="M21 11a8 8 0 0 1-8 8H6l-4 3V9a7 7 0 0 1 7-7h5m3 0v6m-3-3h6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  lock: '<rect x="4" y="10" width="16" height="12" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  logout: '<path d="M9 3H4v18h5m5-5 4-4-4-4m-6 4h13"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.moon}</svg>`;
const escapeText = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const time = (minutes) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const duration = (minutes) =>
  `${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, "0")} м`;
const state = {
  route: "day",
  now: 860,
  schedule: 0,
  empty: false,
  adminView: false,
  date: 3,
  notes: {
    "wake:3:morning:sleep0": "Гуляли в парке, хорошее настроение",
    sleep0: "Уснул на прогулке",
  },
  sleeps: [{ id: "sleep0", start: 650, end: 730, kind: "nap" }],
  dayStart: 390,
  nextSleepId: 1,
  settling: null,
  settlingAttempts: [],
  past: {},
  morningStarts: {},
  schedules: [
    {
      name: "Обычный день",
      description: "Наш привычный ритм",
      values: [260, 80, 280, 20, 180, 600],
    },
    {
      name: "Больше отдыха",
      description: "Для дней, когда нужно выспаться",
      values: [240, 100, 260, 40, 180, 600],
    },
  ],
  users: [
    { name: "Анна Смирнова", email: "anna@example.com", blocked: false },
    { name: "Мария Орлова", email: "maria@example.com", blocked: false },
    { name: "Алексей Иванов", email: "alex@example.com", blocked: true },
  ],
  userIndex: 0,
};
state.dayPlan = structuredClone(state.schedules[0]);
const screen = document.querySelector("#screen");
const sheet = document.querySelector("#sheet");
let toastTimer;
let modalOrigin;
function toast(message) {
  const element = document.querySelector("#toast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("visible"), 3200);
}
function modal(title, body) {
  if (!sheet.open) {
    const active = document.activeElement;
    modalOrigin = active?.id
      ? `#${CSS.escape(active.id)}`
      : [...(active?.attributes || [])]
          .filter(
            (attribute) =>
              attribute.name.startsWith("data-") ||
              attribute.name === "aria-label",
          )
          .map(
            (attribute) =>
              `[${attribute.name}="${CSS.escape(attribute.value)}"]`,
          )
          .join("");
  }
  window.mobileUI.render(document.querySelector("#sheet-content"),
    `<div class="sheet-head"><h2 id="sheet-title">${title}</h2><button class="icon-button" data-action="close" aria-label="Закрыть">${icon("close")}</button></div>${body}`);
  if (!sheet.open) sheet.showModal();
  sheet.scrollTop = 0;
}
sheet.addEventListener("close", () => {
  if (!sheet.open && modalOrigin)
    document.querySelector(modalOrigin)?.focus({ preventScroll: true });
});
function head(title, subtitle, action = "") {
  return `<div class="page-head"><div><h1>${title}</h1><p class="subtle">${subtitle}</p></div>${action}</div>`;
}
function section(title, trailing = "") {
  return `<div class="section-head"><h2>${title}</h2>${trailing}</div>`;
}
function metric(symbol, value, label, detail) {
  return `<div class="metric">${icon(symbol)}<strong>${value}</strong><label>${label}</label><p class="subtle">${detail}</p></div>`;
}
function noteButton(key) {
  return `<button class="note-button" data-action="note" data-key="${key}">${icon("note")}${state.notes[key] ? escapeText(state.notes[key]) : "Добавить заметку"}</button>`;
}
function row(start, end, label, kind, key, forecast = false, active = false) {
  const note =
    !forecast && !state.adminView
      ? noteButton(key)
      : state.notes[key]
        ? `<div class="interval-note">${escapeText(state.notes[key])}</div>`
        : "";
  const recorded = kind === "sleep" ? dayContext().records.find(record => record.id === key) : null;
  const settlingNote = recorded?.settleStart != null ? `<p class="subtle">Укладывание · ${duration(start-recorded.settleStart)} · с ${time(recorded.settleStart)}</p>` : "";
  const attempts = !forecast && kind === "wake" && state.route !== "previous" && !state.adminView
    ? state.settlingAttempts.filter(attempt => attempt.start >= start && attempt.end <= (active ? state.now : end)).map(attempt => `<div class="settling-attempt"><strong>Укладывание без сна</strong><span>${time(attempt.start)} — ${time(attempt.end)} · ${duration(attempt.end-attempt.start)}</span></div>`).join("") : "";
  const dateSuffix = end >= 1440 ? " · завтра" : "";
  return `<div class="time-row ${kind === "sleep" ? "sleep" : ""} ${forecast ? "forecast" : ""}"><div class="time-label">${time(start)}</div><div class="time-track"><span class="time-dot"></span></div><div class="interval"><div class="interval-top"><h3>${label}${active ? '<span class="now-tag">сейчас</span>' : ""}</h3><span class="duration">${duration(Math.max(0, (active ? state.now : end) - start))}</span></div><p class="subtle">${time(start)} — ${active ? "сейчас" : time(end) + dateSuffix}${forecast ? " · прогноз" : ""}</p>${settlingNote}${attempts}${note}${!forecast && !state.adminView ? `<button class="interval-edit" data-action="${kind === "sleep" ? "edit-sleep" : "edit-wake"}" data-key="${key}">${icon("sliders")}${kind === "sleep" ? "Изменить интервал" : "Исправить границы"}</button>` : ""}</div></div>`;
}
function projection() {
  const plan = state.dayPlan.values;
  let cursor = state.dayStart;
  let html = "";
  let sleepTotal = 0;
  let wakeTotal = 0;
  let active = null;
  state.sleeps.forEach((sleep, index) => {
    html += row(
      cursor,
      sleep.start,
      `Бодрствование ${index + 1}`,
      "wake",
      wakeKey(3, state.sleeps[index - 1]?.id, sleep.id),
    );
    wakeTotal += sleep.start - cursor;
    const expected = sleep.start + (plan[index * 2 + 1] || 20);
    html += row(
      sleep.start,
      sleep.end ?? expected,
      sleep.kind === "night" ? "Ночной сон" : `Дневной сон ${index + 1}`,
      "sleep",
      sleep.id,
      false,
      sleep.end === null,
    );
    sleepTotal += Math.max(0, (sleep.end ?? state.now) - sleep.start);
    if (sleep.end === null)
      active = { start: sleep.start, end: expected, kind: "sleep" };
    cursor = sleep.end ?? Math.max(expected, state.now);
  });
  let count = state.sleeps.length;
  if (!active) {
    const end = cursor + (plan[count * 2] || 180);
    active = { start: cursor, end, kind: "wake" };
    wakeTotal += Math.max(0, state.now - cursor);
    html += row(
      cursor,
      end,
      `Бодрствование ${count + 1}`,
      "wake",
      wakeKey(3, state.sleeps[count - 1]?.id),
      false,
      true,
    );
    cursor = Math.max(end, state.now);
  } else {
    const end = cursor + (plan[count * 2] || 180);
    html += row(cursor, end, `Бодрствование ${count + 1}`, "wake", "", true);
    cursor = end;
  }
  for (; count < 2; count += 1) {
    const end = cursor + plan[count * 2 + 1];
    html += row(cursor, end, `Дневной сон ${count + 1}`, "sleep", "", true);
    cursor = end;
    const wakeEnd = cursor + plan[count * 2 + 2];
    html += row(
      cursor,
      wakeEnd,
      `Бодрствование ${count + 2}`,
      "wake",
      "",
      true,
    );
    cursor = wakeEnd;
  }
  html += row(cursor, cursor + plan[5], "Ночной сон", "sleep", "", true);
  return { html, active, sleepTotal, wakeTotal, bedtime: cursor };
}
function settlingControl() {
  if (!state.settling) return `<button class="primary" data-action="settling-start">${icon("clock")}Начать укладывание</button><button class="settling-start" data-action="start">${icon("moon")}Уже уснул</button>`;
  return `<button class="primary" data-action="start">${icon("moon")}Уснул</button><div class="settling-active"><button class="settling-without-sleep" data-action="settling-without-sleep">Завершить без сна</button><button class="settling-without-sleep" data-action="settling-cancel">Отменить без сохранения</button></div>`;
}
setInterval(() => {
  if (!state.settling) return;
  state.now = Math.max(state.now, state.settling.start + Math.floor((Date.now()-state.settling.startedAt)/60000));
  const elapsed = document.querySelector("#settling-elapsed");
  if (elapsed) elapsed.textContent = duration(state.now-state.settling.start);
}, 1000);
function day() {
  if (state.empty)
    return (
      head("Новый день", "Начнём с первого пробуждения") +
      `<div class="empty welcome-card"><div class="empty-orbit">${icon("sun")}</div><h2>У каждого дня<br>свой ритм</h2><p>Добавьте прошедший ночной сон.<br>По времени пробуждения мы построим<br>начало дня и прогноз.</p><button class="primary" data-action="first-night">${icon("plus")}Добавить ночной сон</button></div>`
    );
  const data = projection();
  const asleep = data.active.kind === "sleep";
  const remaining = Math.max(0, data.active.end - state.now);
  const plan = state.dayPlan;
  const readonly = state.adminView;
  const settling = !readonly && !asleep && state.settling;
  return (
    (readonly
      ? `<div class="readonly-banner">${icon("lock")}Дневник ${escapeText(state.users[state.userIndex].name)} · только чтение</div>`
      : "") +
    head(
      "Сегодня",
      "Суббота, 3 октября",
      `<button class="icon-button" data-route="history" aria-label="Выбрать дату">${icon("calendar")}</button>`,
    ) +
    `${readonly ? "" : childCard()}` +
    `<button class="schedule-strip" ${readonly ? "disabled" : 'data-action="choose-schedule"'}>${icon("sliders")}<span>График дня<strong>${escapeText(plan.name)}</strong></span>${icon("arrow")}</button>` +
    `<section class="hero" aria-label="Ближайшее событие"><div class="hero-top"><span class="live-dot"></span>${asleep ? "Малыш спит" : settling ? "Укладываем · малыш бодрствует" : "Малыш бодрствует"} · ${duration(state.now - data.active.start)}</div><div class="hero-art" aria-hidden="true"></div><h2>${settling ? "Укладывание длится" : asleep ? "До пробуждения" : "До следующего сна"}</h2><div class="countdown">${settling ? `<span id="settling-elapsed">${duration(state.now-settling.start)}</span>` : `${Math.floor(remaining / 60)} <small>ч</small> ${remaining % 60} <small>м</small>`}</div><div class="hero-detail">${settling ? `Начали в ${time(settling.start)} · входит в бодрствование` : `Ориентир — ${time(data.active.end)} · по графику дня`}</div>${readonly ? "" : asleep ? `<button class="primary" data-action="finish">${icon("sun")}Проснулся</button>` : settlingControl()}</section>` +
    (readonly
      ? '<button class="text-button add-past" data-action="admin-plans">Графики пользователя · только чтение</button>'
      : `<button class="text-button add-past" data-action="add-sleep">${icon("plus")}Добавить прошедший сон</button>`) +
    section("Уже сегодня", `<span>На ${time(state.now)}</span>`) +
    `<div class="metrics">${metric("sun", `${Math.floor(data.sleepTotal / 60)}<small> ч </small>${data.sleepTotal % 60}<small> м</small>`, "Дневной сон", "из " + duration(plan.values[1] + plan.values[3]))}${metric("moon", "—", "Ночной сон", "ещё впереди")}${metric("clock", `${Math.floor(data.wakeTotal / 60)}<small> ч </small>${data.wakeTotal % 60}<small> м</small>`, "Бодрствование", "с текущим периодом")}</div>` +
    section(
      "Лента дня",
      '<div class="legend"><span><i></i>Факт</span><span><i class="future"></i>Прогноз</span></div>',
    ) +
    `<div class="timeline"><div class="previous-night-context"><span class="kicker">ПРЕДЫДУЩАЯ НОЧЬ · 2 ОКТЯБРЯ</span><p>20:30 — ${time(state.dayStart)} · ${duration(210 + state.dayStart)}</p><p class="subtle">Завершение этой ночи задаёт начало дня. В сегодняшние итоги не входит.</p></div>${data.html}</div><p class="info-note">${icon("info")}Бодрствование считается между снами. Прогноз меняется вместе с вашим днём.</p>` +
    (readonly
      ? '<button class="outline-button" data-route="admin">Назад к пользователям</button>'
      : "")
  );
}
function planCard(plan, index, choosing = false) {
  const selected = state.schedule === index;
  const total = plan.values.reduce((a,b) => a+b,0);
  return `<article class="card plan-card ${selected ? "selected" : ""}"><div class="plan-heading"><span class="plan-symbol">${icon("sliders")}</span><span class="badge">${selected ? "Выбран на сегодня" : "Личный график"}</span></div><h2>${escapeText(plan.name)}</h2><p class="subtle">${escapeText(plan.description)}</p><div class="plan-totals"><div><strong>${duration(plan.values[1]+plan.values[3])}</strong><span>дневного сна</span></div><div><strong>${duration(plan.values[5])}</strong><span>ночного сна</span></div></div><div class="mini-plan" aria-label="Чередование бодрствования и сна">${plan.values.map((v,i)=>`<i class="${i===5 ? "night" : i%2 ? "nap" : ""}" style="flex:${v}"></i>`).join("")}</div><div class="plan-sequence">${plan.values.map((v,i)=>`<span>${icon(i%2 ? "moon" : "sun")}<strong>${duration(v)}</strong></span>`).join("")}</div><p class="form-note">2 дневных сна · полный цикл ${duration(total)}</p><div class="card-actions"><button data-action="${choosing ? "apply-schedule" : "edit-schedule"}" data-index="${index}">${choosing ? "Выбрать на сегодня" : "Настроить график"}</button>${icon("arrow")}</div></article>`;
}
function schedules() {
  return head("Мои графики", "Ориентиры для вашего дня") + state.schedules.map((p,i)=>planCard(p,i)).join("") + `<button class="outline-button" data-action="new-schedule">${icon("plus")}Создать график</button><p class="info-note">${icon("info")}Изменение шаблона не переписывает историю.</p>`;
}
function historyPage() {
  return (
    head("История", "Каждый день складывается в историю") +
    (!state.adminView
      ? `<div class="history-tools"><button data-route="statistics">${icon("chart")}Статистика</button><button data-report="export">${icon("download")}Экспорт CSV</button></div>`
      : "") +
    `<div class="card calendar-card"><div class="section-head" style="margin-top:0"><h2>Октябрь <span class="calendar-year">2026</span></h2><span class="badge">3 дня с записями</span></div><div class="weekdays">${["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => `<span>${d}</span>`).join("")}</div><div class="calendar">${"<span></span>".repeat(3)}${Array.from({ length: 31 }, (_, i) => `<button class="${i + 1 === state.date ? "selected" : ""} ${i < 3 ? "recorded" : ""}" data-action="history-date" data-index="${i + 1}" ${i > 2 ? "disabled" : ""} aria-label="${i + 1} октября${i > 2 ? ", нет записей" : ""}">${i + 1}</button>`).join("")}</div></div>` +
    section("Записи по дням", '<span>Октябрь</span>') +
    [3, 2, 1]
      .map(
        (d) =>
          `<button class="history-row" data-action="history-date" data-index="${d}"><div class="date-tile"><strong>${d}</strong>окт</div><div><strong>${d === 3 ? "Сегодня" : d === 2 ? "Пятница" : "Четверг"}</strong><p class="subtle">${d === 3 ? "День продолжается" : historySummary(d)}</p></div>${icon("arrow")}</button>`,
      )
      .join("")
  );
}
function dayContext() {
  if (state.route !== "previous")
    return { day: 3, records: state.sleeps, start: state.dayStart };
  if (!state.past[state.date])
    state.past[state.date] = {
      start: 390,
      records: [
        { id: `past${state.date}-a`, start: 650, end: 730, kind: "nap" },
        { id: `past${state.date}-b`, start: 1010, end: 1030, kind: "nap" },
        {
          id: `past${state.date}-night`,
          start: 1210,
          end: 1810,
          kind: "night",
        },
      ],
    };
  return { day: state.date, ...state.past[state.date] };
}
function wakeKey(day, left = "morning", right = "now") {
  return `wake:${day}:${left}:${right}`;
}
function previousDay() {
  const context = dayContext();
  let cursor = context.start;
  let totalWake = 0;
  const timeline = context.records
    .map((sleep, index) => {
      const awake = row(
        cursor,
        sleep.start,
        `Бодрствование ${index + 1}`,
        "wake",
        wakeKey(context.day, context.records[index - 1]?.id, sleep.id),
      );
      totalWake += sleep.start - cursor;
      cursor = sleep.end;
      return (
        awake +
        row(
          sleep.start,
          sleep.end,
          sleep.kind === "night" ? "Ночной сон" : `Дневной сон ${index + 1}`,
          "sleep",
          sleep.id,
        )
      );
    })
    .join("");
  const total = (kind) =>
    context.records
      .filter((record) => record.kind === kind)
      .reduce((sum, record) => sum + record.end - record.start, 0);
  return (
    (state.adminView
      ? `<div class="readonly-banner">${icon("lock")}История пользователя · только чтение</div>`
      : "") +
    head(
      `${state.date} октября`,
      "Обычный день · завершён",
      `<button class="icon-button" data-route="history" aria-label="Вернуться в историю">${icon("back")}</button>`,
    ) +
    `<div class="archive-caption">${icon("check")}День завершён<span>График сохранён вместе с записями</span></div>` +
    section("Итоги дня") +
    `<div class="metrics">${metric("sun", duration(total("nap")), "Дневной сон", "по записям")}${metric("moon", duration(total("night")), "Ночной сон", "по записям")}${metric("clock", duration(totalWake), "Бодрствование", "дневное")}</div>` +
    section("Лента дня", '<span>Сохранённые записи</span>') +
    `<div class="timeline">${timeline}</div>`
  );
}
function profile() {
  return head("Профиль", "Ваш малыш и ваше пространство") + section("Малыш") + childCard(true) + section("Родитель") + `<div class="account-card"><div class="avatar">А</div><div><h2>Анна Смирнова</h2><p class="subtle">anna@example.com</p></div><button class="icon-button" data-report="profile" aria-label="Изменить личные данные">${icon("arrow")}</button></div>` + section("Настройки") + `<div class="card preferences-card">${themeControls()}<button class="settings-row" data-action="timezone">${icon("clock")}<span>Часовой пояс<small>Москва · UTC+3</small></span>${icon("arrow")}</button><button class="settings-row" data-route="schedules">${icon("sliders")}<span>Мои графики<small>${state.schedules.length} личных графика</small></span>${icon("arrow")}</button></div><button class="outline-button logout-button" data-route="login">${icon("logout")}Выйти из аккаунта</button><details class="demo-box"><summary>Сценарии макета</summary><div id="profile-platform-switcher" aria-label="Оформление макета"></div><p class="subtle">Для просмотра разных состояний интерфейса</p><div class="chips"><button data-action="demo-empty">Первый день</button><button data-route="night">Ночной сон</button><button data-action="demo-reset">Пример дня</button><button data-route="admin">Администратор</button><button data-route="blocked">Блокировка</button></div></details>`;
}
function admin() {
  return (
    head("Пользователи", "Управление доступом") + `<div class="admin-summary"><div><strong>${state.users.length}</strong><span>аккаунта</span></div><div><strong>${state.users.filter(u=>!u.blocked).length}</strong><span>активных</span></div></div>` +
    `<div class="readonly-banner">${icon("lock")}Дневники доступны только для чтения</div><label class="subtle" for="user-search">Поиск по имени или email</label><input id="user-search" type="search" placeholder="Найти пользователя" style="margin:8px 0 18px">` +
    `<div id="users-list">${userCards()}</div>`
  );
}
function userCards(query = "") {
  return (
    state.users
      .map((user, index) => ({ user, index }))
      .filter(({ user }) =>
        `${user.name} ${user.email}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
      .map(
        ({ user, index }) =>
          `<div class="card user-card"><div class="user-heading"><div class="avatar">${escapeText(user.name[0])}</div><div><h3>${escapeText(user.name)}</h3><p class="subtle">${escapeText(user.email)}</p></div></div><p class="status ${user.blocked ? "blocked" : ""}" style="margin-top:10px">${user.blocked ? "Заблокирован" : "Активен"}</p><div class="card-actions"><button data-action="view-user" data-index="${index}">Открыть дневник</button><button class="${user.blocked ? "" : "danger"}" data-action="block-user" data-index="${index}">${user.blocked ? "Разблокировать" : "Заблокировать"}</button></div></div>`,
      )
      .join("") || '<p class="subtle">Пользователи не найдены</p>'
  );
}
function auth(register = false) {
  return `<div class="auth-art"><span class="auth-moon">${icon("moon")}</span><span class="kicker">ДНЕВНИК СНА МАЛЫША</span><p>Спокойствие начинается<br>с понятного ритма.</p></div><h1 class="auth-title">${register ? "Начнём ваш<br>дневник" : "Рады видеть<br>вас снова"}</h1><p class="subtle">${register ? "Сохраняйте ритм малыша день за днём." : "Ваши графики и история уже здесь."}</p><form id="auth-form" class="auth-card">${register ? '<label for="name">Ваше имя</label><input id="name" autocomplete="name" required placeholder="Анна">' : ""}<label for="email">Email</label><input id="email" type="email" autocomplete="email" required placeholder="anna@example.com"><label for="password">Пароль</label><input id="password" type="password" autocomplete="${register ? "new-password" : "current-password"}" minlength="8" required placeholder="Не менее 8 символов"><button class="primary" type="submit">${register ? "Создать аккаунт" : "Войти"}</button><p class="form-note">Это макет: данные никуда не отправляются.</p></form><button class="text-button add-past" data-route="${register ? "login" : "register"}">${register ? "Уже есть аккаунт? Войти" : "Впервые здесь? Зарегистрироваться"}</button>`;
}
function render() {
  const pages = {
    day,
    schedules,
    history: historyPage,
    statistics: statisticsPage,
    "public-report": publicReportPage,
    night: nightPage,
    previous: previousDay,
    profile,
    admin,
    login: () => auth(),
    register: () => auth(true),
    blocked: () =>
      `<div class="empty welcome-card"><div class="empty-orbit">${icon("lock")}</div><h2>Доступ приостановлен</h2><p>Администратор заблокировал аккаунт.<br>Ваши записи сохранены.<br>Для восстановления доступа обратитесь к администратору.</p><button class="primary" data-route="login">Вернуться ко входу</button></div>`,
  };
  screen.dataset.page = state.route;
  window.mobileUI.render(screen, (pages[state.route] || day)());
  window.mobileUI.mountPlatformSwitcher(document.querySelector("#profile-platform-switcher"));
  document.querySelector(".app-header").hidden =
    state.route === "public-report";
  const hidden = ["login", "register", "blocked", "public-report"].includes(
    state.route,
  );
  document.querySelector("#navigation").hidden = hidden;
  document.querySelector("#navigation").style.display = hidden ? "none" : "";
  window.mobileUI.render(document.querySelector("#navigation"), (
    state.adminView || state.route === "admin"
      ? [
          ["admin", "user", "Пользователи"],
          ["profile", "logout", "Выйти из демо"],
        ]
      : [
          ["day", "sun", "Сегодня"],
          ["history", "calendar", "История"],
          ["statistics", "chart", "Статистика"],
          ["schedules", "sliders", "Графики"],
          ["profile", "user", "Профиль"],
        ]
  )
    .map(
      ([route, symbol, title]) =>
        `<button data-route="${route}" ${state.route === route || (state.route === "previous" && route === "history") ? 'aria-current="page"' : ""}>${icon(symbol)}${title}</button>`,
    )
    .join(""));
}
function navigate(route) {
  state.route = route;
  if (!["day", "history", "previous"].includes(route)) state.adminView = false;
  window.history.replaceState(null, "", `#${route}`);
  render();
  window.scrollTo(0, 0);
}
function toInput(day, minutes) {
  return new Date(Date.UTC(2026, 9, day, 0, minutes))
    .toISOString()
    .slice(0, 16);
}
function inputMinutes(day, value) {
  return (Date.parse(value + "Z") - Date.UTC(2026, 9, day)) / 60000;
}
function minutesAgoText(value) {
  if (value === 0) return "Только что";
  const last = value % 10;
  const teen = value % 100 >= 11 && value % 100 <= 14;
  return `${value} ${!teen && last === 1 ? "минуту" : !teen && last >= 2 && last <= 4 ? "минуты" : "минут"} назад`;
}
function startSleepSheet() {
  if (state.adminView || state.sleeps.some(s => s.end === null)) return;
  modal("Когда уснул?", `<form id="start-sleep-form"><input type="hidden" name="minutes-ago" value="5"><p class="wheel-hint" id="minutes-hint">Прокрутите, чтобы выбрать минуты назад</p><div class="minute-wheel-frame"><div class="minute-wheel" id="minute-wheel" role="spinbutton" tabindex="0" aria-label="Минут назад" aria-describedby="minutes-hint" aria-valuemin="0" aria-valuemax="60" aria-valuenow="5" aria-valuetext="5 минут назад">${Array.from({length:61},(_,i)=>`<div class="minute-option" aria-hidden="true" data-minute="${i}">${minutesAgoText(i)}</div>`).join("")}</div></div><p class="start-preview">Начало сна — <strong id="start-sleep-time">${time(state.now-5)}</strong></p><p id="start-sleep-error" class="error" role="alert"></p><button class="primary" type="submit">Записать сон</button><button type="button" class="text-button add-past" data-action="close">Отмена</button></form>`);
  const wheel = document.querySelector("#minute-wheel");
  const rowHeight = () => wheel.firstElementChild.getBoundingClientRect().height;
  const update = () => {
    const value = Math.max(0, Math.min(60, Math.round(wheel.scrollTop / rowHeight())));
    wheel.setAttribute("aria-valuenow", value);
    wheel.setAttribute("aria-valuetext", minutesAgoText(value));
    wheel.closest("form").elements["minutes-ago"].value = value;
    wheel.querySelectorAll(".minute-option").forEach(row => row.classList.toggle("is-selected", Number(row.dataset.minute) === value));
    document.querySelector("#start-sleep-time").textContent = time(state.now-value);
    document.querySelector("#start-sleep-error").textContent = "";
  };
  const choose = value => {
    wheel.scrollTop = Math.max(0, Math.min(60, value)) * rowHeight();
    update();
  };
  wheel.addEventListener("scroll", update, {passive:true});
  wheel.addEventListener("click", event => {
    const row = event.target.closest("[data-minute]");
    if (row) choose(Number(row.dataset.minute));
  });
  wheel.addEventListener("keydown", event => {
    const value = Number(wheel.getAttribute("aria-valuenow"));
    const keys = {ArrowUp:value-1, ArrowDown:value+1, Home:0, End:60, PageUp:value-5, PageDown:value+5};
    if (!(event.key in keys)) return;
    event.preventDefault();
    choose(keys[event.key]);
  });
  choose(5);
  wheel.focus({preventScroll:true});
}
function saveSleepStart(form) {
  if (state.adminView || state.sleeps.some(s => s.end === null)) return;
  const minutes = Number(new FormData(form).get("minutes-ago"));
  const start = state.now - minutes;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 60) return;
  if (start < (state.sleeps.at(-1)?.end ?? state.dayStart)) {
    form.querySelector("#start-sleep-error").textContent = "Это время раньше окончания предыдущего сна. Выберите меньше минут назад.";
    return;
  }
  if (state.settling && start < state.settling.start) {
    form.querySelector("#start-sleep-error").textContent = "Сон не может начаться раньше укладывания. Выберите меньше минут назад или «Только что».";
    return;
  }
  const settleStart = state.settling?.start ?? null;
  state.settling = null;
  if (state.sleeps.length >= 2) {
    state.nightSettleStart = settleStart;
    state.activeNightStart = start;
    sheet.close();
    navigate("night");
  } else {
    const id = `sleep${state.nextSleepId++}`;
    closeWakeNote(state.sleeps.at(-1)?.id, id);
    state.sleeps.push({id, start, end:null, kind:"nap", settleStart});
    sheet.close();
    render();
  }
  toast("Начало сна отмечено · " + time(start));
}
function sleepForm(id = null, finish = false) {
  if (state.adminView) return;
  const context = dayContext();
  const morning = id === "morning";
  const current = morning
    ? {
        start: state.morningStarts[context.day] ?? -210,
        end: context.start,
        kind: "night",
      }
    : context.records.find((record) => record.id === id);
  const open = current?.end === null && !finish;
  const start = current?.start ?? 800;
  const end = current?.end ?? (finish ? state.now + 20 : state.now);
  modal(
    morning
      ? "Исправить утренний подъём"
      : finish
        ? "Малыш проснулся"
        : current
          ? "Изменить интервал"
          : "Добавить сон",
    `
    <form id="sleep-form" data-id="${id || ""}" data-day="${context.day}" data-finish="${finish}">
    <p class="subtle">${current ? "Исправьте время — соседнее бодрствование и итоги пересчитаются. Заметки останутся на месте." : "Укажите фактическое время сна."}</p>
    <label for="sleep-kind">Тип сна</label><select id="sleep-kind" ${current ? "disabled" : ""}><option value="nap" ${current?.kind !== "night" ? "selected" : ""}>Дневной сон</option><option value="night" ${current?.kind === "night" ? "selected" : ""}>Ночной сон</option></select>
    <fieldset class="sleep-boundaries"><legend>Время сна</legend><label for="sleep-start">Начало сна</label><input id="sleep-start" type="datetime-local" value="${toInput(context.day, start)}" required>
    <label for="sleep-end">Окончание сна</label><input id="sleep-end" type="datetime-local" value="${open ? "" : toInput(context.day, end)}" ${open ? "disabled" : "required"}>
    ${current?.end === null && !finish ? '<label class="check-row"><input id="still-asleep" type="checkbox" checked>Малыш ещё спит</label>' : ""}
    </fieldset><div class="edit-summary" id="edit-summary" aria-live="polite"></div>
    <label for="sleep-note">Заметка к сну</label><textarea id="sleep-note" maxlength="500" placeholder="Как прошёл сон?">${escapeText(state.notes[morning ? `morning${context.day}` : id] || "")}</textarea>
    <p id="form-error" class="error" role="alert"></p>
    <button type="submit" class="primary">${current ? "Сохранить изменения" : "Сохранить сон"}</button><button type="button" class="text-button add-past" data-action="close">Отмена</button>
    </form>`,
  );
  updateEditSummary();
}
function updateEditSummary() {
  const form = document.querySelector("#sleep-form");
  if (!form) return;
  const context = dayContext();
  const start = inputMinutes(
    context.day,
    document.querySelector("#sleep-start").value,
  );
  const open = document.querySelector("#still-asleep")?.checked;
  const end = open
    ? state.now
    : inputMinutes(context.day, document.querySelector("#sleep-end").value);
  const current = context.records.find(
    (record) => record.id === form.dataset.id,
  );
  const summary = document.querySelector("#edit-summary");
  if (!summary) return;
  const valid = Number.isFinite(start) && Number.isFinite(end) && end > start;
  summary.innerHTML = valid
    ? `<span>Длительность${open ? " на сейчас" : ""}</span><strong>${current ? duration((current.end ?? state.now) - current.start) + " → " : ""}${duration(end - start)}</strong><small>Бодрствование пересчитается автоматически</small>`
    : "<span>Укажите корректные начало и окончание сна</span>";
}
function wakeEditor(key) {
  if (state.adminView) return;
  const [, , left, right] = key.split(":");
  const context = dayContext();
  const previous = context.records.find((record) => record.id === left);
  const next = context.records.find((record) => record.id === right);
  modal(
    "Исправить бодрствование",
    `<p class="subtle">Этот промежуток считается между снами. Исправьте запись, которая задаёт неверную границу.</p><div class="boundary-list">
    <button class="settings-row" data-action="edit-sleep" data-key="${left}">${icon("sun")}<span>Начало · ${time(previous?.end ?? context.start)}<small>${previous ? "Изменить окончание предыдущего сна" : "Исправить окончание ночного сна"}</small></span>${icon("arrow")}</button>
    ${next ? `<button class="settings-row" data-action="edit-sleep" data-key="${right}">${icon("moon")}<span>Конец · ${time(next.start)}<small>Изменить начало следующего сна</small></span>${icon("arrow")}</button>` : `<p class="info-note">Интервал продолжается. Его конец появится, когда вы отметите следующий сон.</p>`}
    </div><button class="outline-button" data-action="note" data-key="${key}">Изменить заметку</button><button class="text-button add-past" data-action="close">Готово</button>`,
  );
}
function scheduleForm(index = null) {
  const plan = state.schedules[index ?? state.schedule];
  modal(
    index === null ? "Новый график" : "Редактор графика",
    `<form id="schedule-form" data-index="${index ?? ""}"><label for="plan-name">Название</label><input id="plan-name" required maxlength="40" value="${index === null ? "" : escapeText(plan.name)}" placeholder="Например, выходной день"><fieldset class="schedule-fields"><legend>Длительность периодов</legend>${["Бодрствование 1", "Дневной сон 1", "Бодрствование 2", "Дневной сон 2", "Бодрствование 3", "Ночной сон"].map((label, i) => `<div class="schedule-field"><label for="duration-${i}">${icon(i%2 ? "moon" : "sun")}${label}</label><input id="duration-${i}" name="duration" type="text" inputmode="numeric" pattern="[0-9]{1,2}:[0-5][0-9]" value="${time(plan.values[i])}" required aria-describedby="duration-help"></div>`).join("")}</fieldset><p class="form-note" id="duration-help">Длительность в формате ч:мм. Сумма может отличаться от 24 часов.</p><p id="form-error" class="error" role="alert"></p><button class="primary" type="submit">Сохранить график</button></form>`,
  );
}
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action], [data-route]");
  if (!button) return;
  if (button.dataset.route) return navigate(button.dataset.route);
  const index = Number(button.dataset.index);
  switch (button.dataset.action) {
    case "close":
      sheet.close();
      break;
    case "admin-plans":
      modal(
        "Графики пользователя",
        state.schedules
          .map((p, i) =>
            planCard(p, i).replace(/<div class="card-actions">.*?<\/div>/g, ""),
          )
          .join(""),
      );
      break;
    case "settling-start":
      if (state.adminView || state.settling || projection().active.kind === "sleep") break;
      state.settling = {start:state.now, startedAt:Date.now()};
      render();
      toast("Укладывание началось · " + time(state.now));
      break;
    case "settling-without-sleep":
      if (state.adminView || !state.settling) break;
      state.now = Math.max(state.now, state.settling.start + Math.floor((Date.now()-state.settling.startedAt)/60000));
      state.settlingAttempts.push({start:state.settling.start, end:state.now});
      state.settling = null;
      render();
      toast("Укладывание завершено без сна");
      break;
    case "settling-cancel":
      if (state.adminView) break;
      state.settling = null;
      render();
      toast("Укладывание отменено");
      break;
    case "start":
      startSleepSheet();
      break;
    case "finish":
      sleepForm(state.sleeps.at(-1).id, true);
      break;
    case "add-sleep":
      sleepForm();
      break;
    case "edit-sleep":
      sleepForm(button.dataset.key);
      break;
    case "edit-wake":
      wakeEditor(button.dataset.key);
      break;
    case "note":
      modal(
        "Заметка к интервалу",
        `<form id="note-form" data-key="${button.dataset.key}"><label for="note-text">Что хочется запомнить?</label><textarea id="note-text" maxlength="500" placeholder="Прогулка, настроение, как засыпал…">${escapeText(state.notes[button.dataset.key] || "")}</textarea><button class="primary" type="submit">Сохранить заметку</button></form>`,
      );
      break;
    case "choose-schedule":
      modal(
        "График на сегодня",
        state.schedules.map((p, i) => planCard(p, i, true)).join(""),
      );
      break;
    case "apply-schedule":
      state.schedule = index;
      state.dayPlan = structuredClone(state.schedules[index]);
      sheet.close();
      render();
      toast("График сегодняшнего дня изменён");
      break;
    case "edit-schedule":
      scheduleForm(index);
      break;
    case "new-schedule":
      scheduleForm();
      break;
    case "history-date":
      state.date = index;
      navigate(index === 3 ? "day" : "previous");
      break;
    case "timezone":
      modal(
        "Часовой пояс",
        '<p class="subtle">Демонстрационный дневник использует московское время.</p><label for="timezone">Часовой пояс</label><select id="timezone"><option>Москва · Europe/Moscow · UTC+3</option></select><p class="info-note">Часовой пояс прошлых дней сохраняется вместе с записями.</p><button class="primary" data-action="close">Готово</button>',
      );
      break;
    case "demo-empty":
      state.empty = true;
      navigate("day");
      break;
    case "demo-reset":
      location.reload();
      break;
    case "first-night":
      modal(
        "Прошедший ночной сон",
        '<form id="first-night-form"><label for="night-start">Уснул</label><input id="night-start" type="datetime-local" value="2026-10-02T20:30" required><label for="night-end">Проснулся утром</label><input id="night-end" type="datetime-local" value="2026-10-03T06:30" required><p class="form-note">В этом макете переход покажет пример дня с подъёмом в 06:30.</p><button class="primary" type="submit">Открыть пример дня</button></form>',
      );
      break;
    case "view-user":
      state.empty = false;
      state.adminView = true;
      state.userIndex = index;
      navigate("day");
      break;
    case "block-user": {
      const user = state.users[index];
      modal(
        user.blocked ? "Восстановить доступ?" : "Заблокировать аккаунт?",
        `<p class="subtle">${escapeText(user.name)}<br>${user.blocked ? "Пользователь снова сможет открыть свой дневник." : "Пользователь потеряет доступ. Его записи сохранятся."}</p><form id="block-form" data-index="${index}"><label for="block-reason">Причина</label><textarea id="block-reason" required placeholder="Укажите причину решения"></textarea><button class="primary" type="submit">${user.blocked ? "Разблокировать" : "Заблокировать"}</button></form>`,
      );
      break;
    }
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "user-search")
    document.querySelector("#users-list").innerHTML = userCards(
      event.target.value,
    );
});
document.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.id === "start-sleep-form") saveSleepStart(form);
  if (form.id === "auth-form") {
    navigate("day");
    toast("Демонстрационный вход · данные не отправлены");
  }
  if (form.id === "note-form") {
    state.notes[form.dataset.key] = document.querySelector("#note-text").value;
    sheet.close();
    render();
    toast("Заметка сохранена в макете");
  }
  if (form.id === "sleep-form") saveSleep(form);
  if (form.id === "schedule-form") {
    const values = [...form.querySelectorAll('[name="duration"]')].map(
      (input) =>
        Number(input.value.split(":")[0]) * 60 +
        Number(input.value.split(":")[1]),
    );
    if (values.some((v) => v <= 0)) {
      document.querySelector("#form-error").textContent =
        "Все интервалы должны быть больше нуля.";
      return;
    }
    const plan = {
      name: document.querySelector("#plan-name").value.trim(),
      description: "Ваш личный график",
      values,
    };
    if (!plan.name) {
      document.querySelector("#form-error").textContent =
        "Введите название графика.";
      return;
    }
    if (form.dataset.index === "") state.schedules.push(plan);
    else state.schedules[Number(form.dataset.index)] = plan;
    sheet.close();
    render();
    toast("График сохранён в макете");
  }
  if (form.id === "block-form") {
    state.users[Number(form.dataset.index)].blocked =
      !state.users[Number(form.dataset.index)].blocked;
    sheet.close();
    render();
    toast("Статус пользователя изменён в макете");
  }
  if (form.id === "first-night-form") {
    state.empty = false;
    sheet.close();
    navigate("day");
  }
});
window.addEventListener("hashchange", () => {
  state.route = location.hash.slice(1) || "day";
  state.adminView = false;
  render();
});
state.route = location.hash.slice(1) || "day";
render();

function nightPage() {
  const saved = state.savedNight;
  return (
    head(
      "Ночной сон",
      saved ? "Сохранённый интервал" : "Суббота, 3 октября · пример состояния",
    ) +
    `<section class="hero night-hero"><div class="hero-top"><span class="live-dot"></span>${saved ? "Сон завершён" : "Тихое время"}</div><div class="hero-art" aria-hidden="true"></div><h2>${saved ? "Продолжительность сна" : "Малыш спит уже"}</h2><div class="countdown">${saved ? duration(saved.minutes) : state.activeNightStart !== undefined ? duration(state.now-state.activeNightStart) : "3 <small>ч</small> 00 <small>м</small>"}</div><p class="hero-detail">${saved ? escapeText(saved.start.replace("T", " · ")) + " → " + escapeText(saved.end.replace("T", " · ")) : state.activeNightStart !== undefined ? "С " + time(state.activeNightStart) : "С 20:10 · подъём по графику в 06:10 завтра"}</p></section>` +
    `${state.nightSettleStart != null ? `<p class="info-note">Укладывание · ${duration((state.activeNightStart ?? state.now)-state.nightSettleStart)} · с ${time(state.nightSettleStart)}</p>` : ""}` +
    `<button class="outline-button night-finish" data-action="night-record">${icon("sun")}${saved ? "Изменить интервал" : "Завершить ночной сон"}</button><p class="form-note">${saved ? "Время сна сохранено." : "Нажмите, когда сон закончился, например при утреннем подъёме."}</p>` +
    section("Заметка о ночи") +
    noteButton("night") +
    `<div class="card" style="margin-top:15px"><h3>Ночь относится к 3 октября</h3><p class="subtle">Утром она останется в итогах прошедшего дня. К дневному бодрствованию ночные пробуждения не прибавляются.</p></div>`
  );
}
document.addEventListener("change", (event) => {
  if (event.target.id === "sleep-kind" && event.target.value === "night") {
    document.querySelector("#sleep-start").value = toInput(3, state.activeNightStart ?? 1210);
    document.querySelector("#sleep-end").value = "2026-10-04T06:10";
  }
});
document.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="night-record"]')) {
    sleepForm();
    document.querySelector("#sleep-form").dataset.scope = "night";
    document.querySelector("#sleep-kind").value = "night";
    document
      .querySelector("#sleep-kind")
      .dispatchEvent(new Event("change", { bubbles: true }));
    if (state.savedNight) {
      document.querySelector("#sleep-start").value = state.savedNight.start;
      document.querySelector("#sleep-end").value = state.savedNight.end;
      document.querySelector("#sleep-note").value = state.notes.night || "";
      document.querySelector("#sheet-title").textContent =
        "Изменить ночной сон";
      document.querySelector("#sleep-form .primary").textContent =
        "Сохранить изменения";
    }
    updateEditSummary();
  }
});

function closeWakeNote(left, right) {
  const oldKey = wakeKey(3, left);
  if (state.notes[oldKey]) {
    state.notes[wakeKey(3, left, right)] = state.notes[oldKey];
    delete state.notes[oldKey];
  }
}
function saveSleep(form) {
  if (state.adminView) return;
  const context = dayContext();
  const id = form.dataset.id;
  const kind = document.querySelector("#sleep-kind").value;
  const startValue = document.querySelector("#sleep-start").value;
  const endValue = document.querySelector("#sleep-end").value;
  const start = inputMinutes(context.day, startValue);
  const open = Boolean(document.querySelector("#still-asleep")?.checked);
  const end = open ? null : inputMinutes(context.day, endValue);
  const note = document.querySelector("#sleep-note").value;
  const error = (message) => {
    document.querySelector("#form-error").textContent = message;
  };
  if (!Number.isFinite(start) || (!open && !Number.isFinite(end)))
    return error("Заполните дату и время.");
  if ((!open && end <= start) || (open && start > state.now))
    return error(
      "Окончание должно быть позже начала. Текущий сон не может начинаться в будущем.",
    );
  if (form.dataset.scope === "night" || (!id && kind === "night")) {
    state.savedNight = {
      start: startValue,
      end: endValue,
      minutes: end - start,
    };
    state.notes.night = note;
    sheet.close();
    navigate("night");
    toast("Ночной сон изменён");
    return;
  }
  if (id === "morning") {
    if (start >= 0 || end < 0 || end > (context.records[0]?.start ?? state.now))
      return error(
        "Ночь должна начаться накануне, а утренний подъём — не позже следующего сна.",
      );
    if (context.day === 3) state.dayStart = end;
    else state.past[context.day].start = end;
    state.morningStarts[context.day] = start;
    state.notes[`morning${context.day}`] = note;
  } else {
    const currentIndex = context.records.findIndex(
      (record) => record.id === id,
    );
    const current = context.records[currentIndex];
    const previous = context.records[currentIndex - 1];
    const next = context.records[currentIndex + 1];
    if (
      start < context.start ||
      (kind === "nap" && (start >= 1440 || end >= 1440)) ||
      end > 2880
    )
      return error(
        "Проверьте дату: сон должен относиться к выбранному дню, ночной может закончиться завтра.",
      );
    const overlaps = context.records.some(
      (record) =>
        record.id !== id &&
        start < (record.end ?? Infinity) &&
        (end ?? Infinity) > record.start,
    );
    if (overlaps)
      return error(
        "Этот сон пересекается с другой записью. Исправьте время начала или окончания.",
      );
    if (
      current &&
      ((previous && start < previous.end) ||
        (next && (end ?? Infinity) > next.start))
    )
      return error(
        "Изменение меняет порядок снов. Укажите время между соседними записями.",
      );
    if (
      !current &&
      (context.records.length >= 2 ||
        start < (context.records.at(-1)?.end ?? context.start))
    )
      return error(
        "В примере можно добавить до двух дневных снов, последовательно.",
      );
    if (
      context.day === 3 &&
      !open &&
      end > state.now &&
      form.dataset.finish !== "true"
    )
      return error(
        "Нельзя сохранить завершённый сон в будущем. Время макета — " +
          time(state.now) +
          ".",
      );
    if (open && next)
      return error("Незавершённый сон должен быть последней записью.");
    const saved = {
      id: current?.id || `sleep${state.nextSleepId++}`,
      start,
      end,
      kind,
      settleStart: current?.settleStart ?? null,
    };
    if (current) context.records[currentIndex] = saved;
    else {
      closeWakeNote(context.records.at(-1)?.id, saved.id);
      context.records.push(saved);
    }
    state.notes[saved.id] = note;
    if (context.day === 3 && form.dataset.finish === "true")
      state.now = Math.max(state.now, end);
  }
  sheet.close();
  render();
  toast("Изменения сохранены · интервалы и итоги пересчитаны");
}
document.addEventListener("input", (event) => {
  if (event.target.closest("#sleep-form")) updateEditSummary();
});
document.addEventListener("change", (event) => {
  if (event.target.id === "still-asleep") {
    const field = document.querySelector("#sleep-end");
    field.disabled = event.target.checked;
    field.required = !event.target.checked;
    field.value = event.target.checked
      ? ""
      : toInput(dayContext().day, state.now);
  }
  if (event.target.closest("#sleep-form")) updateEditSummary();
});

function historySummary(day) {
  const saved = state.past[day];
  if (!saved) return "1 ч 40 м сна · 12 ч бодрствования";
  const naps = saved.records
    .filter((record) => record.kind === "nap")
    .reduce((sum, record) => sum + record.end - record.start, 0);
  const night = saved.records.find((record) => record.kind === "night");
  return `${duration(naps)} сна · ${duration(night.start - saved.start - naps)} бодрствования`;
}

document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  screen.focus();
  screen.scrollIntoView({ block: "start" });
});
