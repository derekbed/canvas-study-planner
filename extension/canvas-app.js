(function () {
  "use strict";
  if (location.origin !== "https://canvas.upenn.edu") return;
  const model = globalThis.CoursewiseInsightsModel;
  const palette = globalThis.CoursewiseCanvasPalette;
  const state = { active: false, tab: "today", courseId: "all", category: "all", comingUpCollapsed: false, pageHistory: [], workspace: null, preferences: { canvasBackground: "#f7faf9", canvasThemeMode: "light" },
    live: { courses: [], work: [], announcements: [], calendar: [], errors: [] }, loading: false, busy: false,
    chatCourse: "", chatId: "", chats: [], chatMessages: [], chatLoading: false, chatMore: false, chatGeneration: 0, chatRetry: null, chatPending: null, chatError: "", session: null, pairCode: "", question: "", includePage: false, selected: new Set(), sourceTouched: false, answer: null,
    message: "", extensionDisconnected: false, knowledge: new Map(), knowledgeDrafts: new Map(), dismissedAnnouncements: new Set(), page: {}, host: null, shell: null, hidden: null, activePath: "", previousFocus: null };
  const tabs = [["today", "Today"], ["courses", "Courses"], ["materials", "Materials"], ["knowledge", "Knowledge"], ["ask", "Ask"]];
  const el = (tag, label, className) => {
    const node = document.createElement(tag);
    if (label !== undefined) node.textContent = label;
    if (className) node.className = className;
    return node;
  };
  const append = (parent, ...children) => { children.filter(Boolean).forEach(child => parent.append(child)); return parent; };
  const button = (label, fn, className = "") => { const node = el("button", label, className); node.type = "button"; node.addEventListener("click", fn); return node; };
  const date = value => { const time = Date.parse(value || ""); return Number.isFinite(time) ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(time) : "Date unavailable"; };
  const clean = (value, max = 180) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
  const titleCase = value => String(value).replaceAll("_", " ").replace(/\b[a-z]/g, letter => letter.toUpperCase());
  const factOrder = ["exam_dates", "grading_weights", "assignment_schedule", "course_topics", "late_policy", "readings", "attendance_policy", "academic_integrity_policy", "collaboration_policy", "office_hours", "instructor_contact"];
  const factLabels = { exam_dates: "Exams & quizzes", grading_weights: "Assignment weighting", assignment_schedule: "Assignments & due dates", course_topics: "Topics covered", late_policy: "Late work", readings: "Readings", attendance_policy: "Attendance", academic_integrity_policy: "Academic integrity & AI", collaboration_policy: "Collaboration", office_hours: "Office hours", instructor_contact: "Instructor contact" };
  const reconnectMessage = "Coursewise reloaded while this Canvas tab was open. Refresh Canvas, then reopen Coursewise.";
  const extensionConnectionLost = error => /Extension context invalidated|context invalidated|Receiving end does not exist|message port closed/i.test(String(error?.message || error || ""));
  function reconnectError(cause) {
    const error = new Error(reconnectMessage);
    error.status = 409;
    error.reconnect = true;
    error.cause = cause;
    state.extensionDisconnected = true;
    return error;
  }
  const safeCanvasUrl = value => {
    try { const url = new URL(value, location.origin); return url.origin === location.origin &&
      !/\/feeds?\/|\.ics(?:$|\/)|calendar[_-]?feed/i.test(url.pathname) ? url.origin + url.pathname : ""; } catch { return ""; }
  };
  async function broker(type, extra = {}) {
    if (!chrome.runtime?.id) throw reconnectError();
    let reply;
    try { reply = await chrome.runtime.sendMessage({ type: "cw:" + type, ...extra }); }
    catch (error) { if (extensionConnectionLost(error)) throw reconnectError(error); throw error; }
    if (!reply?.ok) {
      const error = new Error(reply?.error?.message || "Coursewise is unavailable.");
      error.status = reply?.error?.status || 503;
      if (error.status === 401) state.session = { paired: false };
      throw error;
    }
    return reply.data;
  }
  function globalMenu() {
    return document.querySelector("#menu, #global_nav, .ic-app-header__menu-list, nav[aria-label*='Global'] ul, nav[aria-label*='Global'], [aria-label='Global Navigation'] ul");
  }
  function navItem() {
    let item = document.getElementById("cw-canvas-nav-item");
    if (item) return item;
    const menu = globalMenu(); if (!menu) return null;
    item = el("li", undefined, "ic-app-header__menu-list-item cw-nav-item"); item.id = "cw-canvas-nav-item";
    const control = button("", activate, "cw-nav-control");
    control.setAttribute("aria-label", "Open Coursewise workspace");
    control.append(el("span", "◈", "cw-nav-icon"), el("span", "Coursewise", "cw-nav-label"));
    control.addEventListener("keydown", event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); activate(); } });
    item.append(control);
    const anchors = [...menu.querySelectorAll("a[href]")];
    const pathOf = anchor => { try { return new URL(anchor.href, location.origin).pathname; } catch { return ""; } };
    const inbox = anchors.find(anchor => /\/(?:conversations|inbox)\/?$/.test(pathOf(anchor)));
    const calendar = anchors.find(anchor => /\/calendar\/?$/.test(pathOf(anchor)));
    if (inbox?.closest("li")) inbox.closest("li").before(item);
    else if (calendar?.closest("li")) calendar.closest("li").after(item);
    else menu.append(item);
    updateNav(); return item;
  }
  function updateNav() {
    const control = document.querySelector("#cw-canvas-nav-item button");
    if (!control) return;
    if (state.active) control.setAttribute("aria-current", "page"); else control.removeAttribute("aria-current");
  }
  function applyCanvasTheme() {
    const selected = /^#[0-9a-f]{6}$/i.test(state.preferences.canvasBackground) ? state.preferences.canvasBackground : "#f7faf9";
    const mode = ["light", "dark", "system"].includes(state.preferences.canvasThemeMode) ? state.preferences.canvasThemeMode : "light";
    const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    palette.applyTheme(selected, dark);
  }
  function applyCanvasBranding() {
    const setVisibleName = (node, name) => {
      let target = node;
      while (target.children.length === 1 && target.firstElementChild.textContent.trim() === target.textContent.trim())
        target = target.firstElementChild;
      if (target.textContent !== name) target.textContent = name;
    };
    for (const course of state.workspace?.courses || []) {
      if (!course.canvas_id) continue;
      const links = [...document.querySelectorAll("a[href]")].filter(link => {
        try { return new URL(link.href, location.origin).pathname === `/courses/${course.canvas_id}`; } catch { return false; }
      });
      links.forEach(link => {
        const card = link.closest(".ic-DashboardCard");
        const cardTitle = card?.querySelector(".ic-DashboardCard__header-title");
        if (cardTitle && !cardTitle.contains(link)) return;
        const original = (link.dataset.cwOriginalName || link.textContent || "").trim();
        // Canvas uses empty, full-card links. Giving those links text places it
        // at the image edge and changes the card's spacing.
        if (!original) return;
        if (!link.dataset.cwOriginalName) link.dataset.cwOriginalName = original;
        setVisibleName(link, course.name);
      });
      const cards = new Set(links.map(link => link.closest(".ic-DashboardCard")).filter(Boolean));
      for (const card of cards) {
        const title = card.querySelector(".ic-DashboardCard__header-title");
        if (title?.textContent.trim()) setVisibleName(title, course.name);
        const hero = card.querySelector(".ic-DashboardCard__header_hero");
        const pictureHost = card.querySelector(".ic-DashboardCard__header_image") || hero;
        if (!pictureHost) continue;
        const colors = { blue: "#c4d7f2", lavender: "#d4c7f0", peach: "#f3ceb5", mint: "#bce2cc", butter: "#efe1a3", rose: "#efc2d0", sky: "#bcdff1" };
        if (hero && colors[course.color]) hero.style.setProperty("background-color", colors[course.color], "important");
        let picture = card.querySelector(".cw-custom-course-picture");
        if (course.image_url) {
          hero?.classList.toggle("cw-custom-course-header", hero === pictureHost);
          pictureHost.classList.add("cw-custom-course-header");
          if (!picture) { picture = el("img", undefined, "cw-custom-course-picture"); picture.alt = ""; }
          if (picture.parentElement !== pictureHost) pictureHost.prepend(picture);
          if (picture.getAttribute("src") !== course.image_url) picture.src = course.image_url;
        } else {
          picture?.remove(); hero?.classList.remove("cw-custom-course-header"); pictureHost.classList.remove("cw-custom-course-header");
        }
      }
    }
  }
  function capturePage() {
    const main = document.querySelector("#content, main, [role='main']");
    const path = safeCanvasUrl(location.href);
    const text = clean(main?.innerText || "", 1800).replace(/https?:\/\/\S*(?:feed|\.ics)\S*/gi, "[private link omitted]");
    return { url: path, pageTitle: clean(document.title, 180), courseName: clean(document.querySelector("#breadcrumbs a[href*='/courses/']")?.textContent, 120), visibleTextSummary: text };
  }
  function sizeWorkspace() {
    if (!state.active || !state.host) return;
    const left = Math.max(0, state.host.getBoundingClientRect().left);
    const available = Math.max(320, window.innerWidth - left);
    document.documentElement.style.setProperty("--cw-app-available-width", `${available}px`);
  }
  function activate() {
    if (state.active) return;
    const host = document.querySelector("#content, main, [role='main']");
    if (!host) { state.message = "Canvas content area is unavailable on this page."; return; }
    state.previousFocus = document.activeElement;
    state.page = capturePage();
    state.host = host;
    const shell = el("section", undefined, "cw-app"); shell.id = "cw-canvas-app";
    shell.setAttribute("aria-label", "Coursewise workspace");
    const original = el("div"); original.id = "cw-original-content";
    while (host.firstChild) original.append(host.firstChild);
    original.hidden = true;
    host.append(original, shell);
    state.hidden = original; state.shell = shell; state.active = true;
    state.activePath = location.pathname;
    document.body.classList.add("cw-canvas-app-active");
    window.dispatchEvent(new Event("cw-coursewise-visibility"));
    sizeWorkspace();
    history.pushState({ ...(history.state || {}), coursewise: true }, "", location.href);
    updateNav(); render(); loadAll();
    shell.querySelector("h1")?.focus();
  }
  function deactivate() {
    if (!state.active) return;
    const { host, hidden, shell } = state;
    shell?.remove();
    if (host && hidden) { while (hidden.firstChild) host.append(hidden.firstChild); hidden.remove(); }
    state.active = false; state.shell = null; state.hidden = null;
    document.body.classList.remove("cw-canvas-app-active");
    window.dispatchEvent(new Event("cw-coursewise-visibility"));
    document.documentElement.style.removeProperty("--cw-app-available-width");
    updateNav(); state.previousFocus?.focus?.();
  }
  window.addEventListener("popstate", event => { if (state.active && !event.state?.coursewise) deactivate(); });
  window.addEventListener("resize", sizeWorkspace);
  async function apiPages(path, pairs, limit = 2) {
    let next = new URL(path, location.origin), rows = [];
    for (const [key, value] of pairs) next.searchParams.append(key, value);
    for (let page = 0; next && page < limit; page++) {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000);
      let response;
      try { response = await fetch(next, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal }); }
      finally { clearTimeout(timeout); }
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Canvas did not provide this list.");
      const data = await response.json(); if (!Array.isArray(data)) throw new Error("Canvas returned an unexpected list.");
      rows.push(...data);
      const href = response.headers.get("link")?.split(",").find(part => /rel="?next"?/.test(part))?.match(/<([^>]+)>/)?.[1];
      const candidate = href ? new URL(href) : null;
      next = candidate?.origin === location.origin && candidate.pathname === path ? candidate : null;
    }
    return rows;
  }
  async function loadLive() {
    const live = { courses: [], work: [], announcements: [], calendar: [], errors: [] };
    if (!model) { live.errors.push("Canvas organizer is unavailable. Reload the extension."); return live; }
    try {
      const courses = await apiPages("/api/v1/users/self/favorites/courses", [["include[]", "total_scores"], ["per_page", "100"]], 2);
      live.courses = courses.map(model.courseFor).filter(Boolean).slice(0, 30);
      try {
        const enrollments = await apiPages("/api/v1/users/self/enrollments", [["type[]", "StudentEnrollment"], ["per_page", "100"]], 2);
        const map = new Map(live.courses.map(course => [course.id, course]));
        for (const enrollment of enrollments) { const course = map.get(String(enrollment.course_id)); if (course) map.set(course.id, model.withEnrollmentGrade(course, enrollment)); }
        live.courses = [...map.values()];
      } catch { /* grades may be hidden */ }
      const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const end = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      try {
        const calendarEnd = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
        const rows = await apiPages("/api/v1/calendar_events", [["type", "event"], ["start_date", new Date().toISOString().slice(0, 10)],
          ["end_date", calendarEnd], ["per_page", "100"]], 2);
        live.calendar = rows.filter(item => item?.title && (item.start_at || item.end_at)).slice(0, 80).map(item => ({
          title: clean(item.title, 180), dueAt: item.start_at || item.end_at,
          courseId: /^course_(\d+)$/.exec(item.context_code || "")?.[1] || "",
          url: safeCanvasUrl(item.html_url), kind: "event" })).filter(item => item.title);
      } catch { live.errors.push("Canvas calendar is unavailable."); }
      for (let i = 0; i < Math.min(live.courses.length, 15); i += 3) await Promise.all(live.courses.slice(i, i + 3).map(async course => {
        try {
          const assignments = await apiPages(`/api/v1/courses/${course.id}/assignments`, [["bucket", "unsubmitted"], ["include[]", "submission"], ["order_by", "due_at"], ["per_page", "100"]], 3);
          live.work.push(...model.organizeWork(assignments, course.id));
        } catch { live.errors.push(`${course.name}: assignments unavailable`); }
        try {
          const announcements = await apiPages("/api/v1/announcements", [["context_codes[]", `course_${course.id}`], ["start_date", start], ["end_date", end], ["per_page", "100"]], 2);
          live.announcements.push(...model.organizeAnnouncements(announcements, course.id));
        } catch { live.errors.push(`${course.name}: announcements unavailable`); }
      }));
    } catch { live.errors.push("Canvas course data is unavailable. Check your Canvas sign-in and refresh."); }
    return live;
  }
  async function loadAll() {
    state.loading = true; state.message = "Loading Canvas and Coursewise…"; render();
    const [workspace, live, session] = await Promise.allSettled([broker("getWorkspace"), loadLive(), broker("getSession")]);
    if (workspace.status === "fulfilled") { state.workspace = workspace.value; applyCanvasBranding(); }
    else { state.workspace = null; state.message = workspace.reason.message; }
    if (live.status === "fulfilled") state.live = live.value;
    if (session.status === "fulfilled") state.session = session.value;
    try { state.preferences = await broker("getPreferences"); applyCanvasTheme(); } catch { /* workspace remains usable */ }
    state.loading = false;
    if (workspace.status === "fulfilled") state.message = "";
    if (state.active) render();
    if (state.active && state.tab === "knowledge") await loadKnowledge();
  }
  function savedCourse(live) {
    const courses = state.workspace?.courses || [];
    return courses.find(course => course.canvas_id && course.canvas_id === live.id) ||
      courses.find(course => course.code && course.code.toLowerCase() === live.code.toLowerCase()) ||
      courses.find(course => course.name.toLowerCase() === live.name.toLowerCase()) || null;
  }
  function courseList() {
    const items = [];
    for (const live of state.live.courses) {
      const saved = savedCourse(live);
      items.push({ id: saved?.id || `canvas:${live.id}`, saved, live, name: saved?.name || live.name, code: saved?.code || live.code });
    }
    return items;
  }
  function selectedCourse() { return courseList().find(course => course.id === state.courseId) || null; }
  function matchesCourse(item, course) {
    if (!course) return true;
    return item.courseId === course.live?.id || item.course_id === course.saved?.id;
  }
  function rememberPage() {
    state.pageHistory.push({ tab: state.tab, courseId: state.courseId, category: state.category,
      question: state.question, answer: state.answer, includePage: state.includePage,
      selected: [...state.selected], sourceTouched: state.sourceTouched });
    if (state.pageHistory.length > 20) state.pageHistory.shift();
  }
  function goBack() {
    const previous = state.pageHistory.pop(); if (!previous) return;
    state.tab = previous.tab; state.courseId = previous.courseId; state.category = previous.category;
    state.question = previous.question; state.answer = previous.answer; state.includePage = previous.includePage;
    state.selected = new Set(previous.selected); state.sourceTouched = previous.sourceTouched;
    state.message = ""; render(); if (state.tab === "knowledge") loadKnowledge();
  }
  function selectCourse(id) {
    if (state.busy) return;
    if (id === state.courseId) return;
    rememberPage(); state.courseId = id; state.answer = null; state.selected.clear(); state.sourceTouched = false;
    render(); if (state.tab === "knowledge") loadKnowledge();
  }
  function openTab(key) {
    const nextCourseId = key === "courses" ? "all" : state.courseId;
    if (key === state.tab && nextCourseId === state.courseId) return;
    rememberPage(); state.courseId = nextCourseId; state.tab = key; state.message = "";
    render(); if (key === "knowledge") loadKnowledge();
  }
  async function loadKnowledge() {
    const course = selectedCourse(); if (!course?.saved || state.knowledge.has(course.saved.id)) return;
    try { const data = await broker("getKnowledge", { courseId: course.saved.id }); state.knowledge.set(course.saved.id, data); state.message = ""; }
    catch (error) { state.message = error.message; }
    render();
  }
  async function saveCourse(course) {
    if (!course?.live) return;
    state.busy = true; state.message = "Saving Canvas course to Coursewise…"; render();
    try {
      const result = await broker("saveCourse", { canvasId: course.live.id, name: course.live.name, code: course.live.code || "" });
      state.workspace = await broker("getWorkspace"); state.courseId = result.id;
      state.message = "Course saved. You can upload a syllabus and build its knowledge record.";
      if (state.tab === "knowledge") await loadKnowledge();
    } catch (error) { state.message = error.message; }
    finally { state.busy = false; render(); }
  }
  async function renameCourse(course, name) {
    if (!course?.saved || !name.trim()) return;
    state.busy = true; state.message = "Saving course name…"; render();
    try {
      await broker("renameCourse", { courseId: course.saved.id, name: name.trim() });
      state.workspace = await broker("getWorkspace");
      state.message = "Course name updated.";
    } catch (error) { state.message = error.message; }
    finally { state.busy = false; render(); }
  }
  async function styleCourse(course, color, imageUrl) {
    if (!course?.saved) return;
    state.busy = true; state.message = "Saving course appearance…"; render();
    try { await broker("styleCourse", { courseId: course.saved.id, color, imageUrl }); state.workspace = await broker("getWorkspace"); state.message = "Course appearance updated."; }
    catch (error) { state.message = error.message; }
    finally { state.busy = false; render(); }
  }
  function coursePicker(all = true) {
    const select = el("select", undefined, "cw-select"); select.setAttribute("aria-label", "Choose course");
    if (all) { const option = el("option", "All courses"); option.value = "all"; select.append(option); }
    for (const course of courseList()) { const option = el("option", course.name); option.value = course.id; select.append(option); }
    if (!all && state.courseId === "all" && select.options.length) state.courseId = select.options[0].value;
    select.value = state.courseId;
    select.addEventListener("change", () => selectCourse(select.value)); return select;
  }
  function empty(message) { return el("p", message, "cw-empty"); }
  function section(title, items, draw) {
    const box = el("section", undefined, "cw-panel");
    append(box, el("h2", title));
    if (!items.length) box.append(empty("Nothing to show here."));
    else items.forEach(item => box.append(draw(item)));
    return box;
  }
  function workRow(item) {
    const row = el("div", undefined, "cw-row");
    const link = el("a", item.title); link.href = safeCanvasUrl(item.url) || "#";
    if (link.href.endsWith("#")) link.removeAttribute("href");
    append(row, link, el("span", `${date(item.dueAt || item.due_at)} · ${item.overdue ? "Overdue" : "Upcoming"}`, "cw-muted"));
    return row;
  }
  function announceRow(item) {
    const row = el("div", undefined, "cw-row"), link = el("a", item.title);
    link.href = safeCanvasUrl(item.url) || "#"; if (link.href.endsWith("#")) link.removeAttribute("href");
    const check = el("input"); check.type = "checkbox"; check.checked = false; check.setAttribute("aria-label", `Dismiss announcement: ${item.title}`);
    check.addEventListener("change", () => dismissAnnouncement(item));
    const label = el("label", undefined, "cw-announcement-check"); append(label, check, el("span", "Mark as read"));
    append(row, link, el("span", date(item.postedAt), "cw-muted"), label); return row;
  }
  async function dismissAnnouncement(item) {
    const key = `${item.courseId}:${item.id}`; state.dismissedAnnouncements.add(key);
    try { await chrome.storage.local.set({ dismissedAnnouncements: [...state.dismissedAnnouncements].slice(-500) }); } catch { /* visual dismissal still works */ }
    render();
  }
  function calendarRow(item) {
    const row = el("div", undefined, "cw-row"), link = el("a", item.title);
    if (item.url) link.href = item.url;
    append(row, link, el("span", date(item.dueAt), "cw-muted")); return row;
  }
  function scopedData() {
    const course = selectedCourse();
    const work = state.live.work.filter(item => state.courseId === "all" || matchesCourse(item, course));
    const announcements = state.live.announcements.filter(item => !state.dismissedAnnouncements.has(`${item.courseId}:${item.id}`) && (state.courseId === "all" || matchesCourse(item, course)));
    const calendar = state.live.calendar.filter(item => state.courseId === "all" || matchesCourse(item, course));
    const saved = (state.workspace?.events || []).filter(item => state.courseId === "all" || matchesCourse(item, course));
    const liveKeys = new Set(work.map(item => `${item.courseId}:${item.title.toLowerCase()}`));
    for (const item of saved) if (item.status !== "done" && !liveKeys.has(`${course?.live?.id}:${item.title.toLowerCase()}`))
      work.push({ ...item, dueAt: item.due_at, courseId: course?.live?.id, overdue: Date.parse(item.due_at) < Date.now() });
    work.sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
    announcements.sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
    return { assignments: work.filter(item => item.kind !== "assessment" && !/\b(quiz|exam|midterm|final|test)\b/i.test(item.title)),
      assessments: work.filter(item => item.kind === "assessment" || /\b(quiz|exam|midterm|final|test)\b/i.test(item.title)), announcements, calendar };
  }
  function renderToday() {
    const body = el("div", undefined, "cw-main-content"), data = scopedData();
    const bar = el("div", undefined, "cw-toolbar");
    append(bar, coursePicker(), ...[["all", "All"], ["assignment", "Assignments"], ["assessment", "Exams & quizzes"], ["announcement", "Announcements"], ["calendar", "Calendar"]].map(([key, label]) => {
      const control = button(label, () => { state.category = key; render(); }, state.category === key ? "cw-chip active" : "cw-chip");
      control.setAttribute("aria-pressed", String(state.category === key)); return control;
    }));
    body.append(bar);
    const insights = (state.workspace?.knowledge || []).filter(item => state.courseId === "all" || item.courseId === selectedCourse()?.saved?.id)
      .flatMap(item => (item.insights || []).map(insight => ({ ...insight, courseName: (state.workspace?.courses || []).find(course => course.id === item.courseId)?.name || "Course" }))).slice(0, 6);
    if (insights.length) body.append(section("Coursewise insights", insights, insight => {
      const row = el("div", undefined, "cw-row");
      append(row, el("strong", insight.title), el("span", `${insight.courseName} · ${insight.detail}`, "cw-muted")); return row;
    }));
    if (["all", "assignment"].includes(state.category)) body.append(section("Assignments", data.assignments.slice(0, 30), workRow));
    if (["all", "assessment"].includes(state.category)) body.append(section("Exams & quizzes", data.assessments.slice(0, 30), workRow));
    if (["all", "announcement"].includes(state.category)) body.append(section("Announcements", data.announcements.slice(0, 20), announceRow));
    if (["all", "calendar"].includes(state.category)) body.append(section("Calendar", data.calendar.slice(0, 20), calendarRow));
    if (state.live.errors.length) body.append(el("p", state.live.errors.join(" · "), "cw-note"));
    return body;
  }
  function renderCourses() {
    const body = el("div", undefined, "cw-main-content"), cards = el("div", undefined, "cw-cards");
    const all = courseList(); if (!all.length) return empty(state.live.errors.length ? state.live.errors.join(" · ") : "No dashboard courses found. Favorite courses in Canvas, then refresh.");
    const current = selectedCourse();
    if (current) {
      const detail = el("section", undefined, "cw-panel"), grade = current.live?.grade?.score ?? current.saved?.current_grade;
      body.append(button("← All courses", () => selectCourse("all"), "cw-text-button cw-course-back"));
      const heading = el("div", undefined, "cw-course-heading"), title = el("div");
      append(title, el("span", current.code || "Course", "cw-eyebrow"), el("h2", current.name));
      heading.append(title);
      if (current.saved) {
        const menu = el("div", undefined, "cw-course-menu"), popup = el("div", undefined, "cw-course-menu-popup");
        popup.id = "cw-course-settings"; popup.hidden = true; popup.setAttribute("role", "group"); popup.setAttribute("aria-label", "Course settings");
        const trigger = button("⋯", () => {
          popup.hidden = !popup.hidden;
          trigger.setAttribute("aria-expanded", String(!popup.hidden));
        }, "cw-course-menu-trigger");
        trigger.setAttribute("aria-label", `Edit ${current.name}`); trigger.setAttribute("aria-haspopup", "true");
        trigger.setAttribute("aria-controls", popup.id); trigger.setAttribute("aria-expanded", "false"); trigger.title = "Edit course";
        menu.addEventListener("focusout", event => { if (event.relatedTarget && !menu.contains(event.relatedTarget)) { popup.hidden = true; trigger.setAttribute("aria-expanded", "false"); } });
        menu.addEventListener("keydown", event => { if (event.key === "Escape") { popup.hidden = true; trigger.setAttribute("aria-expanded", "false"); trigger.focus(); } });
        popup.append(el("h3", "Edit course"));
        const rename = el("form", undefined, "cw-rename-form"), input = el("input", undefined, "cw-input");
        input.type = "text"; input.value = current.name; input.maxLength = 120; input.required = true; input.setAttribute("aria-label", "Course name");
        const submit = el("button", "Save name", "cw-primary"); submit.type = "submit"; submit.disabled = state.busy;
        append(rename, el("label", "Display name", "cw-muted"), input, submit);
        rename.addEventListener("submit", event => { event.preventDefault(); renameCourse(current, input.value); });
        popup.append(rename);
        const appearance = el("div", undefined, "cw-course-appearance");
        append(appearance, el("h3", "Color and picture"));
        const colors = [["blue", "Blue"], ["lavender", "Lavender"], ["peach", "Peach"], ["mint", "Mint"], ["butter", "Butter"], ["rose", "Rose"], ["sky", "Sky"], ["teal", "Teal"], ["violet", "Violet"], ["orange", "Orange"]];
        const swatches = el("div", undefined, "cw-toolbar"); colors.forEach(([color, label]) => { const swatch = button(label, () => styleCourse(current, color, current.saved.image_url || ""), `cw-course-swatch ${color}`); swatch.setAttribute("aria-pressed", String((current.saved.color || "blue") === color)); swatches.append(swatch); });
        const imageInput = el("input", undefined, "cw-image-input"); imageInput.type = "file"; imageInput.accept = globalThis.CoursewiseCourseImage.accept; imageInput.setAttribute("aria-label", `Choose picture for ${current.name}`);
        imageInput.addEventListener("change", async () => { const file = imageInput.files?.[0]; if (!file) return; try { const imageUrl = await globalThis.CoursewiseCourseImage.prepare(file); await styleCourse(current, current.saved.color || "blue", imageUrl); } catch (error) { state.message = error.message; render(); } });
        const imageButton = button("Choose course picture", () => imageInput.click(), "cw-primary cw-image-upload"); appearance.append(swatches, imageButton, imageInput);
        if (current.saved.image_url) { const preview = el("img", undefined, "cw-course-image"); preview.src = current.saved.image_url; preview.alt = `${current.name} course picture`; appearance.append(preview); }
        popup.append(appearance); menu.append(trigger, popup); heading.append(menu);
      }
      append(detail, heading, el("p", grade == null ? "Grade unavailable" : `Current grade: ${grade}%`));
      const actions = el("div", undefined, "cw-toolbar");
      append(actions, ...(!current.saved && current.live ? [button("Save to Coursewise", () => saveCourse(current), "cw-primary")] : []),
        button("Open materials", () => openTab("materials"), "cw-chip"),
        button("Build course knowledge", () => openTab("knowledge"), "cw-chip"),
        button("Ask about this course", () => openTab("ask"), "cw-chip")); detail.append(actions);
      const data = scopedData();
      append(detail, section("Assignments", data.assignments.slice(0, 8), workRow),
        section("Exams & quizzes", data.assessments.slice(0, 8), workRow),
        section("Announcements", data.announcements.slice(0, 6), announceRow));
      const materials = (state.workspace?.materials || []).filter(item => item.course_id === current.saved?.id);
      detail.append(section("Saved materials", materials, item => {
        const row = el("div", undefined, "cw-row");
        append(row, el("strong", item.name), el("span", item.indexed ? "Text indexed" : "Text extraction pending", "cw-muted")); return row;
      }));
      body.append(detail);
      return body;
    }
    for (const course of all) {
      const card = el("article", undefined, "cw-card");
      const grade = course.live?.grade?.score ?? course.saved?.current_grade;
      const next = state.live.work.filter(item => item.courseId === course.live?.id && !item.overdue).sort((a,b) => Date.parse(a.dueAt)-Date.parse(b.dueAt))[0];
      const count = (state.workspace?.materials || []).filter(item => item.course_id === course.saved?.id).length;
      if (course.saved?.image_url) { const image = el("img", undefined, "cw-course-card-image"); image.src = course.saved.image_url; image.alt = ""; card.append(image); }
      append(card, el("span", course.code || "Course", "cw-eyebrow"), el("h2", course.name),
        el("p", grade == null ? "Grade unavailable" : `Current grade ${grade}%`),
        el("p", next ? `Next: ${next.title} · ${date(next.dueAt)}` : "No upcoming Canvas work"),
        el("p", `${count} saved material${count === 1 ? "" : "s"}`),
        button(course.saved ? "Open course" : "Save to Coursewise", () => {
          if (course.saved) selectCourse(course.id);
          else saveCourse(course);
        }, "cw-primary"));
      cards.append(card);
    }
    body.append(cards); return body;
  }
  async function upload(event) {
    event.preventDefault(); const course = selectedCourse(), form = event.currentTarget;
    const file = form.querySelector("input[type='file']")?.files?.[0], kind = form.dataset.kind || "syllabus";
    if (!course?.saved) { state.message = "Choose a course saved in Coursewise before uploading."; render(); return; }
    if (!file || file.size > 5 * 1024 * 1024) { state.message = "Choose a PDF, TXT, or Markdown file under 5 MB."; render(); return; }
    state.busy = true; state.message = "Uploading material…"; render();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = ""; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const type = file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : /\.md$/i.test(file.name) ? "text/markdown" : "text/plain");
      const uploaded = await broker("uploadMaterial", { courseId: course.saved.id, kind,
        file: { name: file.name, type, size: file.size, base64: btoa(binary) } });
      try { state.workspace = await broker("getWorkspace"); }
      catch (error) {
        if (error.reconnect) { state.message = `${file.name} uploaded. Refresh Canvas, then check Saved materials before uploading it again.`; return; }
        throw error;
      }
      state.message = uploaded.indexed ? state.workspace?.settings?.aiExcerptConsent ? "Syllabus uploaded and ready for questions." : "Syllabus uploaded with readable text. Enable AI excerpt consent in Coursewise Data & privacy to use it in answers." : "File uploaded, but no readable text was found.";
      if (uploaded.indexed && kind === "syllabus" && state.workspace?.settings?.aiExcerptConsent) {
        try {
          state.message = "Building sourced course context…"; render();
          await broker("analyzeKnowledge", { courseId: course.saved.id, materialId: uploaded.id });
          state.knowledge.set(course.saved.id, await broker("getKnowledge", { courseId: course.saved.id }));
          state.workspace = await broker("getWorkspace");
          state.message = "Syllabus uploaded. Sourced course context is ready.";
        } catch (error) { state.message = error.reconnect ? "Syllabus uploaded. Refresh Canvas before building sourced course context." : `Syllabus uploaded and ready for questions. Context build needs a retry: ${error.message}`; }
      }
    } catch (error) { state.message = error.reconnect ? `${reconnectMessage} Check Saved materials before uploading the file again.` : error.message; }
    finally { state.busy = false; render(); }
  }
  async function deleteMaterial(item) {
    state.busy = true; state.message = "Deleting material…"; render();
    try { await broker("deleteMaterial", { id: item.id }); state.workspace = await broker("getWorkspace"); state.message = "Material deleted."; }
    catch (error) { state.message = error.message; }
    finally { state.busy = false; render(); }
  }
  function renderMaterials() {
    const body = el("div", undefined, "cw-main-content");
    body.append(coursePicker(false)); const course = selectedCourse();
    if (!course?.saved) { body.append(empty("Save this Canvas course to Coursewise before uploading a syllabus."));
      if (course?.live) body.append(button("Save to Coursewise", () => saveCourse(course), "cw-primary")); return body; }
    const form = el("form", undefined, "cw-panel cw-upload"); form.dataset.kind = "syllabus";
    const input = el("input"); input.type = "file"; input.accept = ".pdf,.txt,.md,application/pdf,text/plain,text/markdown"; input.required = true;
    const submit = el("button", "Upload syllabus", "cw-primary"); submit.type = "submit"; submit.disabled = state.busy;
    append(form, el("h2", "Upload to " + course.name), el("p", "Choose a PDF, TXT, or Markdown syllabus, up to 5 MB."), input, submit);
    form.addEventListener("submit", upload); body.append(form);
    const materials = (state.workspace?.materials || []).filter(item => item.course_id === course.saved.id);
    body.append(section("Saved materials", materials, item => {
      const row = el("div", undefined, "cw-row");
      append(row, el("strong", item.name), el("span", `${item.kind} · ${item.indexed ? "Text indexed" : "Uploaded, text extraction pending"}`, "cw-muted"),
        button("Delete", () => deleteMaterial(item), "cw-text-button")); return row;
    }));
    if (materials.some(item => item.indexed || /\.pdf$/i.test(item.name))) body.append(button("Build course knowledge from a syllabus", () => openTab("knowledge"), "cw-primary"));
    body.append(el("p", "Readable PDFs and text files become study context. Build or refresh the sourced brief in Knowledge.", "cw-note"));
    return body;
  }
  async function analyzeKnowledge(courseId, materialId) {
    state.busy = true; state.message = "Building course knowledge from the selected file…"; render();
    try {
      await broker("analyzeKnowledge", { courseId, materialId });
      state.knowledge.set(courseId, await broker("getKnowledge", { courseId }));
      state.workspace = await broker("getWorkspace");
      state.message = "Course knowledge is ready. Review the facts and fill any gaps.";
    } catch (error) { state.message = error.message; }
    finally { state.busy = false; render(); }
  }
  async function saveKnowledgeFact(courseId, key) {
    const draftKey = `${courseId}:${key}`, value = state.knowledgeDrafts.get(draftKey)?.trim();
    if (!value) { state.message = "Enter the missing course information first."; render(); return; }
    state.busy = true; state.message = "Saving course information…"; render();
    try {
      const data = await broker("saveKnowledge", { courseId, key, value });
      state.knowledge.set(courseId, data); state.knowledgeDrafts.delete(draftKey);
      state.workspace = await broker("getWorkspace");
      if (state.answer?.missingInformation) state.answer.missingInformation = state.answer.missingInformation.filter(gap => gap.key !== key);
      state.message = "Saved as student-provided information.";
    } catch (error) { state.message = error.message; }
    finally { state.busy = false; render(); }
  }
  function gapForm(courseId, gap) {
    const form = el("form", undefined, "cw-gap-form"), draftKey = `${courseId}:${gap.key}`;
    const label = el("label", gap.question), input = el("textarea");
    input.rows = 2; input.maxLength = 1000; input.value = state.knowledgeDrafts.get(draftKey) || "";
    input.addEventListener("input", () => state.knowledgeDrafts.set(draftKey, input.value));
    label.append(input);
    const save = el("button", "Save information", "cw-primary"); save.type = "submit"; save.disabled = state.busy;
    append(form, label, save);
    form.addEventListener("submit", event => { event.preventDefault(); saveKnowledgeFact(courseId, gap.key); });
    return form;
  }
  function renderKnowledge() {
    const body = el("div", undefined, "cw-main-content");
    body.append(coursePicker(false)); const course = selectedCourse();
    if (!course?.saved) { body.append(empty("Save this Canvas course to build its knowledge record."));
      if (course?.live) body.append(button("Save to Coursewise", () => saveCourse(course), "cw-primary")); return body; }
    const knowledge = state.knowledge.get(course.saved.id);
    if (!knowledge) { body.append(empty("Loading course knowledge…")); return body; }
    const materials = (state.workspace?.materials || []).filter(item => item.course_id === course.saved.id && (item.indexed || /\.pdf$/i.test(item.name)));
    const build = el("section", undefined, "cw-panel");
    append(build, el("h2", "Build knowledge for " + course.name),
      el("p", "Choose a readable syllabus. Its text is sent to Coursewise/OpenAI once when you click Analyze. Coursewise saves a short brief, sourced facts, and searchable passages."));
    if (!materials.length) build.append(empty("Upload a readable PDF, TXT, or Markdown syllabus first."));
    for (const item of materials) {
      const row = el("div", undefined, "cw-row");
      append(row, el("strong", item.name),
        button(item.id === knowledge.sourceMaterialId ? "Analyze again" : "Analyze syllabus", () => analyzeKnowledge(course.saved.id, item.id), "cw-primary"));
      build.append(row);
    }
    body.append(build);
    const factGroups = new Map();
    for (const fact of knowledge.facts || []) {
      if (fact.key === "course_overview") continue;
      if (!factGroups.has(fact.key)) factGroups.set(fact.key, []);
      factGroups.get(fact.key).push(fact);
    }
    const orderedFacts = [...factGroups].sort(([left], [right]) => {
      const leftIndex = factOrder.indexOf(left), rightIndex = factOrder.indexOf(right);
      return (leftIndex < 0 ? factOrder.length : leftIndex) - (rightIndex < 0 ? factOrder.length : rightIndex) || left.localeCompare(right);
    });
    body.append(section("Course information", orderedFacts, ([key, facts]) => {
      const group = el("section", undefined, "cw-row cw-fact-group");
      group.append(el("h3", factLabels[key] || titleCase(key)));
      for (const fact of facts) {
        const entry = el("div", undefined, "cw-fact-entry");
        append(entry, el("p", fact.value),
          el("span", fact.origin === "student" ? "Student provided" : fact.sourceLabel, "cw-muted"));
        group.append(entry);
      }
      return group;
    }));
    const insights = knowledge.insights || [];
    if (insights.length) body.append(section("What to watch", insights, insight => {
      const row = el("div", undefined, "cw-row"); append(row, el("strong", insight.title), el("span", insight.detail, "cw-muted")); return row;
    }));
    const gaps = knowledge.gaps || [];
    const missing = el("section", undefined, "cw-panel");
    append(missing, el("h2", "Help Coursewise fill the gaps"),
      el("p", gaps.length ? "Add any details you know. Student-provided facts stay labeled so Coursewise can distinguish them from the syllabus." : "No required gaps remain. You can reanalyze a new syllabus above if details change."));
    gaps.slice(0, 3).forEach(gap => missing.append(gapForm(course.saved.id, gap)));
    if (gaps.length > 3) {
      const more = el("details"), summary = el("summary", `Show ${gaps.length - 3} other missing detail${gaps.length - 3 === 1 ? "" : "s"}`);
      more.append(summary); gaps.slice(3).forEach(gap => more.append(gapForm(course.saved.id, gap))); missing.append(more);
    }
    body.append(missing);
    if (knowledge.brief) body.append(section("Course overview", [knowledge.brief], value => el("p", value, "cw-brief")));
    return body;
  }
  async function ask(event) {
    event.preventDefault(); const course = selectedCourse();
    if (!course?.saved) { state.message = "Choose a saved Coursewise course."; render(); return; }
    if (!state.question.trim()) { state.message = "Enter a question."; render(); return; }
    if (state.busy || state.chatLoading) return;
    const question = state.question.trim();
    state.busy = true; state.chatError = ""; state.chatPending = question; state.message = ""; render();
    try {
      const canvasSnapshot = course.live ? {
        grade: course.live.grade?.score ?? null,
        items: [
          ...state.live.work.filter(item => item.courseId === course.live.id).slice(0, 12)
            .map(item => ({ kind: item.kind, title: item.title, when: item.dueAt })),
          ...state.live.announcements.filter(item => item.courseId === course.live.id).slice(0, 8)
            .map(item => ({ kind: "announcement", title: item.title, when: item.postedAt })),
          ...state.live.calendar.filter(item => item.courseId === course.live.id).slice(0, 5)
            .map(item => ({ kind: "event", title: item.title, when: item.dueAt })),
        ].slice(0, 20),
      } : null;
      if (!state.chatId) {
        const created = await broker("manageChat", { payload: { action: "create", courseId: course.saved.id } });
        state.chatId = created.conversation.id;
        state.chats.unshift(created.conversation);
      }
      if (state.chatRetry?.question !== question) state.chatRetry = { question, id: crypto.randomUUID() };
      const data = await broker("askCoursewise", { payload: { courseId: course.saved.id, question,
        conversationId: state.chatId, requestId: state.chatRetry.id,
        selectedSourceIds: state.sourceTouched ? [...state.selected] : (state.workspace?.materials || [])
          .filter(item => item.course_id === course.saved.id && item.indexed).map(item => item.id).slice(0, 30),
        canvasContext: state.includePage ? state.page : {}, canvasSnapshot } });
      // Show the saved answer immediately. A later history refresh must not
      // make a successful reply disappear if the local server is interrupted.
      state.chatMessages.push({ id: crypto.randomUUID(), role: "user", content: question },
        { id: crypto.randomUUID(), role: "assistant", content: data.answer, sources: data.sources || [] });
      state.answer = data; state.question = ""; state.chatRetry = null; state.chatPending = null;
      state.message = data.retrieval === "keyword-fallback" ? "Answered using keyword search; semantic search is temporarily unavailable." : "";
      render();
      await loadChat(state.chatId);
      try { state.chats = (await broker("listChats", { courseId: course.saved.id })).conversations; state.chatError = ""; }
      catch { state.chatError = "Your reply is saved. The conversation list could not refresh; use Retry to reload it."; }
    } catch (error) {
      // The reply may have been saved even if its network response was lost.
      // The request ID makes another send safe, and a readable transcript can
      // recover the answer without sending a duplicate request.
      const requestId = state.chatRetry?.id;
      let recovered = false;
      if (state.chatId && requestId) {
        try {
          const data = await broker("getChat", { id: state.chatId });
          const reply = data.messages.find(message => message.role === "assistant" && message.request_id === requestId);
          if (reply) {
            state.chatMessages = data.messages; state.chatMore = data.hasMore;
            state.question = ""; state.chatRetry = null; recovered = true;
            try { state.chats = (await broker("listChats", { courseId: course.saved.id })).conversations; }
            catch { state.chatError = "Your reply is saved. Use Retry to refresh the conversation list."; }
          }
        } catch { /* Keep the question available for a safe retry. */ }
      }
      if (!recovered) { state.question = question; state.chatError = `${error.message || "Coursewise could not answer."} Your question is still in the composer. Try again.`; }
    }
    finally { state.chatPending = null; state.busy = false; render(); }
  }
  async function loadChat(id, older = false) {
    const generation = ++state.chatGeneration; state.chatLoading = true;
    try {
      const data = await broker("getChat", { id, before: older ? state.chatMessages[0]?.sequence : undefined });
      if (generation !== state.chatGeneration) return false;
      state.chatId = id; state.chatMessages = older ? [...data.messages, ...state.chatMessages] : data.messages; state.chatMore = data.hasMore;
      state.chatError = ""; return true;
    } catch (error) { if (generation === state.chatGeneration) state.chatError = `Could not load this conversation: ${error.message}`; return false; }
    finally { if (generation === state.chatGeneration) { state.chatLoading = false; render(); } }
  }
  async function loadCourseChats(courseId) {
    const generation = ++state.chatGeneration;
    if (state.chatCourse !== courseId) {
      state.chatId = ""; state.chats = []; state.chatMessages = []; state.chatMore = false;
      state.chatRetry = null; state.chatPending = null; state.question = "";
    }
    state.chatCourse = courseId; state.chatLoading = true; state.chatError = "";
    try {
      const data = await broker("listChats", { courseId });
      if (generation !== state.chatGeneration) return;
      state.chats = data.conversations;
      if (data.conversations.length) await loadChat(state.chatId && data.conversations.some(chat => chat.id === state.chatId) ? state.chatId : data.conversations[0].id);
      else { state.chatLoading = false; render(); }
    } catch (error) { if (generation === state.chatGeneration) { state.chatLoading = false; state.chatError = `Could not load saved chats: ${error.message}`; render(); } }
  }
  function renderAsk() {
    const body = el("div", undefined, "cw-main-content");
    body.append(coursePicker(false)); const course = selectedCourse();
    if (!course?.saved) { body.append(empty("Choose a saved Coursewise course to ask about it.")); return body; }
    if (state.chatCourse !== course.saved.id && !state.busy) loadCourseChats(course.saved.id);
    const layout = el("div", undefined, "cw-conversations"), sidebar = el("aside", undefined, "cw-chat-sidebar");
    sidebar.append(el("h2", "Your conversations"));
    const fresh = button("+ New conversation", () => { state.chatGeneration++; state.chatLoading = false; state.chatId = ""; state.chatMessages = []; state.chatMore = false; state.question = ""; state.chatRetry = null; render(); }, "cw-primary"); fresh.disabled = state.busy; sidebar.append(fresh);
    for (const chat of state.chats) {
      const item = button(chat.title, () => { loadChat(chat.id); render(); }, state.chatId === chat.id ? "cw-chat-selected" : ""); item.disabled = state.busy || state.chatLoading; sidebar.append(item);
    }
    if (!state.chats.length && !state.chatError) sidebar.append(el("p", "Saved chats appear here.", "cw-note"));
    if (state.chatError) {
      const retry = button("Retry loading chats", () => loadCourseChats(course.saved.id), "cw-text-button");
      retry.disabled = state.busy || state.chatLoading; sidebar.append(retry);
    }
    const main = el("section", undefined, "cw-chat-main"), heading = el("header", undefined, "cw-chat-heading");
    heading.append(el("h2", state.chats.find(c => c.id === state.chatId)?.title || "Ask. Explore. Keep going."));
    if (state.chatId) {
      const rename = button("Rename", async () => { const title = prompt("Conversation name", state.chats.find(c => c.id === state.chatId)?.title || ""); if (!title?.trim()) return;
        try { await broker("manageChat", { payload: { action: "rename", id: state.chatId, title } }); state.chats = (await broker("listChats", { courseId: course.saved.id })).conversations; render(); } catch (error) { state.message = error.message; render(); } });
      const remove = button("Delete", async () => { try { await broker("manageChat", { payload: { action: "delete", id: state.chatId } }); state.chats = state.chats.filter(c => c.id !== state.chatId); state.chatId = ""; state.chatMessages = []; state.chatMore = false; render(); } catch (error) { state.message = error.message; render(); } });
      rename.disabled = remove.disabled = state.busy || state.chatLoading; append(heading, rename, remove);
    }
    main.append(heading);
    const transcript = el("div", undefined, "cw-chat-transcript"); transcript.setAttribute("aria-label", "Conversation");
    if (state.chatMore) { const older = button("Load earlier messages", () => loadChat(state.chatId, true)); older.disabled = state.busy || state.chatLoading; transcript.append(older); }
    if (!state.chatMessages.length && !state.chatLoading) {
      const welcome = el("div", undefined, "cw-chat-welcome"); append(welcome, el("h3", "A little clarity for your coursework"), el("p", "Ask about your course, then work through the follow-ups together."));
      for (const text of ["What should I focus on this week?", "Help me prepare for my next exam.", "Explain the grading policy."]) { const starter = button(text + " ↗", () => { state.question = text; render(); }); starter.disabled = state.busy; welcome.append(starter); } transcript.append(welcome);
    }
    for (const message of state.chatMessages) {
      const row = el("article", undefined, "cw-chat-message " + (message.role === "user" ? "cw-chat-user" : "cw-chat-assistant"));
      append(row, el("small", message.role === "user" ? "YOU" : "COURSEWISE"), message.role === "user" ? el("p", message.content) : CoursewiseChatFormat.render(message.content));
      if (message.sources?.length) { const details = el("details"); details.append(el("summary", `${message.sources.length} sources supplied`)); const list = el("ul"); for (const source of message.sources) list.append(el("li", source)); details.append(list); row.append(details); }
      transcript.append(row);
    }
    if (state.chatPending) {
      const pending = el("article", undefined, "cw-chat-message cw-chat-user cw-chat-pending");
      append(pending, el("small", "SENDING"), el("p", state.chatPending)); transcript.append(pending);
    }
    if (state.busy || state.chatLoading) { const progress = el("p", state.busy ? "Working with your course context…" : "Loading conversation…", "cw-note"); progress.setAttribute("role", "status"); transcript.append(progress); }
    main.append(transcript);
    if (state.chatError) { const error = el("p", state.chatError, "cw-chat-error"); error.setAttribute("role", "alert"); main.append(error); }
    const form = el("form", undefined, "cw-chat-compose");
    const materials = (state.workspace?.materials || []).filter(item => item.course_id === course.saved.id && item.indexed);
    const sources = el("details", undefined, "cw-chat-sources"); sources.append(el("summary", "Course context & sources"));
    for (const item of materials) {
      const option = el("label", undefined, "cw-check"), checkbox = el("input"); checkbox.type = "checkbox"; checkbox.disabled = state.busy; checkbox.checked = !state.sourceTouched || state.selected.has(item.id);
      checkbox.addEventListener("change", () => { if (!state.sourceTouched) { state.selected = new Set(materials.map(material => material.id)); state.sourceTouched = true; } if (checkbox.checked) state.selected.add(item.id); else state.selected.delete(item.id); });
      append(option, checkbox, el("span", item.name)); sources.append(option);
    }
    const page = el("label", undefined, "cw-check"), include = el("input"); include.type = "checkbox"; include.checked = state.includePage; include.disabled = state.busy;
    include.addEventListener("change", () => { state.includePage = include.checked; }); append(page, include, el("span", "Include the Canvas page I was viewing")); sources.append(page);
    sources.append(el("p", "Selected sources and course facts are used for each reply. Earlier messages may discuss previously selected sources. Start a new conversation for a clean context.", "cw-note")); form.append(sources);
    const compose = el("div", undefined, "cw-chat-input"), field = el("textarea"); field.rows = 2; field.maxLength = 2000; field.value = state.question; field.placeholder = state.chatMessages.length ? "Ask a follow-up…" : "Ask about your course…"; field.setAttribute("aria-label", "Message Coursewise"); field.disabled = state.busy || state.chatLoading;
    field.addEventListener("input", () => { state.question = field.value; }); field.addEventListener("keydown", event => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); } });
    const submit = el("button", "Send ↑", "cw-primary"); submit.type = "submit"; submit.disabled = state.busy || state.chatLoading || !state.workspace?.aiAvailable;
    append(compose, field, submit); form.append(compose); form.addEventListener("submit", ask);
    form.append(el("p", "Enter to send · Shift + Enter for a new line · AI can make mistakes; check sources.", "cw-note"));
    if (!state.workspace?.settings?.aiExcerptConsent) form.append(el("p", "Enable AI excerpt consent in Coursewise Data & privacy before asking.", "cw-note"));
    main.append(form); append(layout, sidebar, main); body.append(layout); return body;
  }
  async function pair() {
    state.busy = true; state.message = "Opening Coursewise pairing…"; render();
    try { const data = await broker("startPairing"); state.pairCode = data.code; state.message = "Confirm pairing in the Coursewise tab, then return here."; }
    catch (error) { state.message = error.message; }
    finally { state.busy = false; render(); }
  }
  async function finishPair() {
    state.busy = true; render();
    try { state.session = await broker("completePairing", { code: state.pairCode }); state.pairCode = ""; state.message = "Paired with Coursewise."; await loadAll(); }
    catch (error) { state.message = error.message; if (error.status === 403) state.pairCode = ""; }
    finally { state.busy = false; render(); }
  }
  async function signOut() { await broker("signOut"); state.session = { paired: false }; state.workspace = null; state.answer = null; state.message = "Signed out."; render(); }
  function render() {
    if (!state.active || !state.shell) return;
    const shell = state.shell; shell.style.setProperty("--cw-page-background", "var(--cw-canvas-background, #f7faf9)"); shell.replaceChildren();
    const top = el("header", undefined, "cw-top");
    const heading = el("h1", "Coursewise"); heading.tabIndex = -1;
    const back = button("← Back", goBack, "cw-back-button");
    back.disabled = !state.pageHistory.length;
    back.title = back.disabled ? "No previous Coursewise page" : "Go to previous Coursewise page";
    const topActions = el("div", undefined, "cw-top-actions");
    append(topActions,
      button("Appearance", () => globalThis.CoursewiseAppearance.open(state.workspace), "cw-text-button"),
      button("Refresh", loadAll, "cw-text-button"));
    append(top, append(el("div", undefined, "cw-top-leading"), back,
      append(el("div"), el("span", "YOUR CANVAS WORKSPACE", "cw-eyebrow"), heading)), topActions); shell.append(top);
    const layout = el("div", undefined, state.comingUpCollapsed ? "cw-layout cw-layout-rail-collapsed" : "cw-layout"), side = el("nav", undefined, "cw-sidebar"); side.setAttribute("aria-label", "Coursewise spaces");
    for (const [key, name] of tabs) {
      const control = button(name, () => openTab(key), state.tab === key ? "active" : "");
      if (state.tab === key) control.setAttribute("aria-current", "page"); side.append(control);
    }
    const content = el("main", undefined, "cw-content");
    if (state.loading) content.append(el("p", "Loading your workspace…", "cw-note"));
    if (state.message) { const message = el("p", state.message, "cw-status"); message.setAttribute("role", "status"); content.append(message); }
    if (state.extensionDisconnected) content.append(button("Refresh Canvas", () => location.reload(), "cw-primary"));
    if (!state.session?.paired) {
      const box = el("section", undefined, "cw-panel");
      append(box, el("h2", "Pair your local Coursewise workspace"),
        el("p", "Pair once in the Coursewise tab. Daily course work stays here in Canvas."),
        state.pairCode ? button("Finish pairing", finishPair, "cw-primary") : button("Pair with Coursewise", pair, "cw-primary"));
      content.append(box);
    } else {
      const view = state.tab === "courses" ? renderCourses() : state.tab === "materials" ? renderMaterials() : state.tab === "knowledge" ? renderKnowledge() : state.tab === "ask" ? renderAsk() : renderToday();
      content.append(view);
    }
    const rail = el("aside", undefined, "cw-rail");
    const toggle = button(state.comingUpCollapsed ? "‹" : "›", () => { state.comingUpCollapsed = !state.comingUpCollapsed; render(); }, "cw-coming-up-toggle");
    toggle.setAttribute("aria-label", state.comingUpCollapsed ? "Expand Coming up sidebar" : "Collapse Coming up sidebar");
    toggle.setAttribute("aria-expanded", String(!state.comingUpCollapsed));
    toggle.setAttribute("aria-controls", "cw-coming-up-body");
    append(rail, toggle);
    if (!state.comingUpCollapsed) {
      const railBody = el("div"); railBody.id = "cw-coming-up-body";
      railBody.append(el("h2", "Coming up"));
      const soon = scopedData().assignments.concat(scopedData().assessments).sort((a,b) => Date.parse(a.dueAt)-Date.parse(b.dueAt)).slice(0, 5);
      if (soon.length) soon.forEach(item => railBody.append(workRow(item))); else railBody.append(empty("No upcoming work found."));
      if (state.session?.paired) railBody.append(button("Sign out", signOut, "cw-text-button"));
      rail.append(railBody);
    } else {
      const railBody = el("div"); railBody.id = "cw-coming-up-body"; railBody.hidden = true; rail.append(railBody);
    }
    append(layout, side, content, rail); shell.append(layout);
  }
  navItem();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.cwCanvasPreferences?.newValue) {
      Object.assign(state.preferences, changes.cwCanvasPreferences.newValue);
      applyCanvasTheme();
    }
    if (changes.cwCourseAppearanceUpdated) {
      broker("getWorkspace").then(workspace => { state.workspace = workspace; applyCanvasBranding(); render(); }).catch(() => {});
    }
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.preferences.canvasThemeMode === "system") applyCanvasTheme();
  });
  chrome.storage?.local?.get?.(["dismissedAnnouncements", "cwCanvasPreferences"]).then(data => {
    if (data?.cwCanvasPreferences) { Object.assign(state.preferences, data.cwCanvasPreferences); applyCanvasTheme(); }
    if (Array.isArray(data?.dismissedAnnouncements)) { state.dismissedAnnouncements = new Set(data.dismissedAnnouncements.filter(value => typeof value === "string")); render(); }
  }).catch(() => {});
  // Load lightweight account branding even before the Coursewise tab is opened,
  // so saved names and the selected Canvas background appear on the dashboard.
  Promise.allSettled([broker("getWorkspace"), broker("getPreferences")]).then(([workspace, preferences]) => {
    if (workspace.status === "fulfilled") state.workspace = workspace.value;
    if (preferences.status === "fulfilled") state.preferences = preferences.value;
    if (preferences.status === "fulfilled") applyCanvasTheme();
    if (workspace.status === "fulfilled") applyCanvasBranding();
  });
  const observer = new MutationObserver(() => {
    if (state.active && (!state.shell?.isConnected || location.pathname !== state.activePath)) {
      if (state.shell?.isConnected) deactivate();
      else { state.active = false; state.shell = null; state.hidden = null; updateNav(); }
    }
    if (!document.getElementById("cw-canvas-nav-item")) navItem();
    if (state.workspace) applyCanvasBranding();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  // Canvas can mount the global header after the initial content-script pass.
  let navRetries = 0;
  const retryNav = setInterval(() => {
    navRetries += 1;
    navItem();
    if (document.getElementById("cw-canvas-nav-item") || navRetries >= 30) clearInterval(retryNav);
  }, 500);
})();
