(function () {
  "use strict";
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const model = globalThis.CoursewiseInsightsModel;
  const healthEngine = globalThis.CoursewiseCourseHealth;
  const palette = globalThis.CoursewiseCanvasPalette;
  if (!model || location.origin !== model.ORIGIN) return;

  const state = {
    route: "", courses: new Map(), work: new Map(), announcements: new Map(), syncTimes: new Map(), healthCache: new Map(),
    requested: new Set(), errors: new Map(), loading: false, generation: 0,
    active: "assignment", expanded: new Set(),
    read: new Set(), showRead: false, lastHidden: null, storageError: false,
    preferences: { canvasBackground: "#f7faf9", canvasThemeMode: "light", deadlineWindowDays: 14, ...palette.cachedPreferences() }, workspace: null, railWidth: 320, railCollapsed: false, courseExpanded: false, appearanceCourseId: "", horizontalView: false, horizontalCardHeight: 160, cardScale: 100
  };
  const READ_KEY = "cwReadAssignmentsV1";
  const RAIL_WIDTH_KEY = "cwRailWidthV2";
  const HORIZONTAL_CARD_HEIGHT_KEY = "cwHorizontalCardHeightV1";
  const CARD_SCALE_KEY = "cwCardScaleV1";
  const MIN_HORIZONTAL_CARD_HEIGHT = 160;
  const MAX_HORIZONTAL_CARD_HEIGHT = 500;
  const MIN_CARD_SCALE = 80;
  const MAX_CARD_SCALE = 150;
  const MIN_RAIL_WIDTH = 320;
  const itemKey = item => item.courseId + ":" + item.id;
  const healthNames = { "on-track": "On track", watch: "Watch", "needs-attention": "Needs attention", "limited-data": "Limited data" };
  function healthFor(id) {
    if (!healthEngine || !state.courses.has(id)) return null;
    if ((!state.work.has(id) && !state.errors.has("work:" + id)) ||
        (!state.announcements.has(id) && !state.errors.has("announcements:" + id))) return null;
    const key = [id, state.syncTimes.get(id) || "", state.work.has(id), state.announcements.has(id), [...state.read].join(","), state.generation, Math.floor(Date.now() / 3600000)].join(":");
    const cached = state.healthCache.get(id);
    if (cached?.key === key) return cached.value;
    const value = healthEngine.calculate({ courseId: id, work: state.work.get(id), announcements: state.announcements.get(id),
      grade: state.courses.get(id)?.grade, sourceUpdatedAt: state.syncTimes.get(id),
      available: { work: state.work.has(id), announcements: state.announcements.has(id) }, read: [...state.read] });
    state.healthCache.set(id, { key, value });
    return value;
  }
  function openHealth(id, trigger) {
    const health = healthFor(id), course = state.courses.get(id);
    if (!health || !course) return;
    document.querySelector(".cw-health-dialog")?.close();
    const dialog = node("dialog", undefined, "cw-health-dialog");
    const titleId = `cw-health-title-${id}`;
    dialog.setAttribute("aria-labelledby", titleId);
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener("close", () => { dialog.remove(); if (trigger?.isConnected) trigger.focus(); });
    const sheet = node("section", undefined, "cw-health-sheet");
    const head = node("header", undefined, "cw-health-head");
    const heading = node("div");
    heading.append(node("span", "COURSE HEALTH", "cw-health-eyebrow"));
    const title = node("h2", course.name); title.id = titleId; heading.append(title);
    const close = node("button", "×", "cw-health-close"); close.type = "button"; close.setAttribute("aria-label", "Close course health"); close.addEventListener("click", () => dialog.close());
    head.append(heading, close); sheet.append(head);
    sheet.append(node("strong", healthNames[health.status], `cw-health-state cw-health-state--${health.status}`), node("p", health.summary, "cw-health-summary"));
    const tiles = node("div", undefined, "cw-health-signals");
    const signals = [
      ["Deadlines", health.signals.deadlines.status === "unavailable" ? "Unavailable" : health.signals.deadlines.overdue ? `${health.signals.deadlines.overdue} overdue` : `${health.signals.deadlines.count} in 7 days`],
      ["Submissions", health.signals.submissions.status === "unavailable" ? "Unavailable" : health.signals.submissions.missing ? `${health.signals.submissions.missing} missing` : `${health.signals.submissions.unsubmitted} unsubmitted`],
      ["Announcements", health.signals.announcements.status === "unavailable" ? "Unavailable" : `${health.signals.announcements.unread} recent unread`],
      ["Grade trend", "Not enough graded work"]
    ];
    signals.forEach(([label, detail]) => { const tile = node("div", undefined, "cw-health-tile"); tile.append(node("span", label), node("strong", detail)); tiles.append(tile); });
    sheet.append(tiles);
    sheet.append(node("h3", "Next actions"));
    const actions = node("ul", undefined, "cw-health-actions");
    if (health.actions.length) health.actions.slice(0, 4).forEach(item => {
      const li = node("li"); const link = node("a", item.label); link.href = item.href;
      li.append(link, node("span", item.reason)); actions.append(li);
    });
    else actions.append(node("li", "Review this course in Canvas for the latest information."));
    sheet.append(actions);
    const footer = node("div", undefined, "cw-health-footer");
    const courseLink = node("a", "View course in Canvas"); courseLink.href = course.url;
    const refresh = node("button", "Refresh Canvas data"); refresh.type = "button";
    refresh.addEventListener("click", () => { dialog.close(); load(); });
    footer.append(courseLink, refresh); sheet.append(footer);
    const sync = health.sourceUpdatedAt ? `Last synced ${dateTime.format(new Date(health.sourceUpdatedAt))}${health.stale ? " · May be out of date" : ""}` : "No successful sync yet";
    sheet.append(node("p", sync, "cw-health-sync"), node("p", "This summary helps organize work; Canvas submissions and grades stay unchanged.", "cw-health-note"));
    dialog.append(sheet); document.body.append(dialog); dialog.showModal(); close.focus();
  }
  const validReadKeys = value => Array.isArray(value) ? value.filter(key => typeof key === "string" && /^\d+:\d+$/.test(key)).slice(-500) : [];
  let saveQueue = Promise.resolve();
  function saveRead() {
    const keys = [...state.read].slice(-500);
    saveQueue = saveQueue.then(() => chrome.storage.local.set({ [READ_KEY]: keys })).catch(() => {
      state.storageError = true;
      renderHub();
    });
  }
  function setRead(item, read) {
    const key = itemKey(item);
    if (read) {
      state.read.add(key);
      state.lastHidden = item;
    } else {
      state.read.delete(key);
      state.lastHidden = null;
    }
    saveRead();
    renderHub();
  }
  const dateTime = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const dateOnly = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  const monthOnly = new Intl.DateTimeFormat(undefined, { month: "short" });
  const dayOnly = new Intl.DateTimeFormat(undefined, { day: "numeric" });
  const spaces = [
    { key: "assignment", name: "Assignments", label: "Work to do", description: "Homework and projects by deadline. Check an item to mark it as read.", tone: "mint" },
    { key: "assessment", name: "Exams & quizzes", label: "Prepare ahead", description: "Assessments have their own space, apart from everyday coursework.", tone: "peach" },
    { key: "announcement", name: "Announcements", label: "Stay informed", description: "Course updates to read, separate from work with due dates.", tone: "lavender" }
  ];
  const node = (tag, value, className) => {
    const el = document.createElement(tag);
    if (value !== undefined) el.textContent = value;
    if (className) el.className = className;
    return el;
  };
  async function broker(type, extra = {}) {
    const reply = await chrome.runtime.sendMessage({ type: "cw:" + type, ...extra });
    if (!reply?.ok) throw new Error(reply?.error?.message || "Coursewise is unavailable.");
    return reply.data;
  }
  function applyBackground() {
    const selected = /^#[0-9a-f]{6}$/i.test(state.preferences.canvasBackground) ? state.preferences.canvasBackground : "#f7faf9";
    const mode = ["light", "dark", "system"].includes(state.preferences.canvasThemeMode) ? state.preferences.canvasThemeMode : "light";
    const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    palette.applyTheme(selected, dark, mode);
  }
  function effectiveDarkMode() {
    return state.preferences.canvasThemeMode === "dark" || (state.preferences.canvasThemeMode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  }
  async function saveAppearancePreferences(patch) {
    const controls = [...document.querySelectorAll(".cw-appearance-dialog :is(select,input,button):not(.cw-appearance-close)")];
    controls.forEach(control => { control.disabled = true; });
    const status = document.querySelector(".cw-appearance-status");
    if (status) status.textContent = "Saving…";
    const previous = { ...state.preferences };
    Object.assign(state.preferences, patch);
    applyBackground(); syncAppearanceModeControls(); renderCards();
    try {
      Object.assign(state.preferences, await broker("setPreferences", patch));
      if (status) status.textContent = "Saved.";
    }
    catch (error) {
      Object.assign(state.preferences, previous); applyBackground(); syncAppearanceModeControls(); renderCards();
      const status = document.querySelector(".cw-appearance-status"); if (status) status.textContent = error.message;
    }
    finally { controls.forEach(control => { control.disabled = false; }); syncAppearanceModeControls(); }
  }
  function syncAppearanceModeControls() {
    const dark = effectiveDarkMode();
    const colorways = document.querySelector(".cw-appearance-light-options");
    const note = document.querySelector(".cw-appearance-dark-note");
    if (colorways) colorways.hidden = dark;
    if (note) note.hidden = !dark;
    const mode = document.querySelector('.cw-appearance-dialog select[aria-label="Canvas appearance mode"]');
    if (mode) mode.value = state.preferences.canvasThemeMode || "light";
    const deadlineWindow = document.querySelector('.cw-appearance-dialog select[aria-label="Next deadline window"]');
    if (deadlineWindow) deadlineWindow.value = String(deadlineWindowDays());
    const picker = document.querySelector('.cw-appearance-dialog input[type="color"]');
    if (picker) picker.value = palette.background(state.preferences.canvasBackground || "#f7faf9");
    document.querySelectorAll(".cw-appearance-dialog [data-background-color]").forEach(swatch => {
      swatch.setAttribute("aria-pressed", String(swatch.dataset.backgroundColor === palette.background(state.preferences.canvasBackground)));
    });
  }
  function appearancePanel() {
    const backdrop = node("dialog", undefined, "cw-appearance-backdrop");
    backdrop.setAttribute("aria-labelledby", "cw-appearance-title");
    backdrop.addEventListener("click", event => { if (event.target === backdrop) backdrop.close(); });
    backdrop.addEventListener("close", () => backdrop.remove());
    const box = node("section", undefined, "cw-appearance-dialog");
    const head = node("header", undefined, "cw-appearance-dialog__head");
    const title = node("h2", "Coursewise settings"); title.id = "cw-appearance-title";
    const close = node("button", "×", "cw-appearance-close"); close.type = "button"; close.setAttribute("aria-label", "Close Coursewise settings"); close.addEventListener("click", () => backdrop.close());
    head.append(title, close); box.append(head);
    const modeLabel = node("label", "Appearance mode", "cw-appearance-field");
    const modeSelect = node("select"); modeSelect.setAttribute("aria-label", "Canvas appearance mode");
    [["light", "Always light"], ["dark", "Always dark"], ["system", "Match system"]].forEach(([value, label]) => { const option = node("option", label); option.value = value; modeSelect.append(option); });
    modeSelect.value = state.preferences.canvasThemeMode || "light";
    modeSelect.addEventListener("change", () => saveAppearancePreferences({ canvasThemeMode: modeSelect.value }));
    modeLabel.append(modeSelect); box.append(modeLabel);
    const deadlineLabel = node("label", "Show next deadline within", "cw-appearance-field");
    const deadlineSelect = node("select"); deadlineSelect.setAttribute("aria-label", "Next deadline window");
    [[1, "1 day"], [3, "3 days"], [7, "1 week"], [14, "2 weeks"], [30, "30 days"]].forEach(([days, label]) => { const option = node("option", label); option.value = String(days); deadlineSelect.append(option); });
    deadlineSelect.value = String(deadlineWindowDays());
    deadlineSelect.addEventListener("change", () => saveAppearancePreferences({ deadlineWindowDays: Number(deadlineSelect.value) }));
    deadlineLabel.append(deadlineSelect); box.append(deadlineLabel);
    const darkNote = node("p", "Dark mode uses one fixed dark colorway.", "cw-appearance-dark-note"); box.append(darkNote);
    const colorways = node("div", undefined, "cw-appearance-light-options");
    colorways.append(node("strong", "Light background color"), node("span", "Choose a pastel or set a custom color.", "cw-hub__appearance-help"));
    const row = node("div", undefined, "cw-hub__appearance-row");
    palette.presets.forEach(({ background: color, name: label }) => {
      const swatch = node("button", label, "cw-hub__swatch"); swatch.type = "button"; swatch.style.backgroundColor = color; swatch.setAttribute("aria-pressed", String(palette.background(state.preferences.canvasBackground) === color));
      swatch.dataset.backgroundColor = color;
      swatch.addEventListener("click", () => saveAppearancePreferences({ canvasBackground: color })); row.append(swatch);
    });
    const picker = node("input"); picker.type = "color"; picker.value = palette.background(state.preferences.canvasBackground); picker.setAttribute("aria-label", "Custom Canvas background color"); picker.addEventListener("change", () => saveAppearancePreferences({ canvasBackground: picker.value }));
    row.append(node("span", "Custom", "cw-hub__appearance-help"), picker); colorways.append(row); box.append(colorways);
    const status = node("p", "", "cw-appearance-status"); status.setAttribute("role", "status"); box.append(status);
    backdrop.append(box); return backdrop;
  }
  function coursePicturePanel(courseId) {
    const course = state.workspace?.courses?.find(item => String(item.id) === String(courseId));
    if (!course) return null;
    const backdrop = node("dialog", undefined, "cw-appearance-backdrop");
    backdrop.setAttribute("aria-labelledby", "cw-course-picture-title");
    backdrop.addEventListener("click", event => { if (event.target === backdrop) backdrop.close(); });
    backdrop.addEventListener("close", () => backdrop.remove());
    const box = node("section", undefined, "cw-appearance-dialog");
    const head = node("header", undefined, "cw-appearance-dialog__head");
    const title = node("h2", `${course.name} picture`); title.id = "cw-course-picture-title";
    const close = node("button", "×", "cw-appearance-close"); close.type = "button"; close.setAttribute("aria-label", "Close course picture settings"); close.addEventListener("click", () => backdrop.close());
    head.append(title, close); box.append(head);
    const details = node("div", undefined, "cw-appearance-course-controls");
    let pendingImageUrl = null, pendingFileName = "";
    const status = node("p", "", "cw-appearance-status"); status.setAttribute("role", "status");
    const renderPicture = () => {
      details.replaceChildren();
      const previewUrl = pendingImageUrl === null ? course.image_url : pendingImageUrl;
      const upload = node("input"); upload.type = "file"; upload.accept = globalThis.CoursewiseCourseImage.accept; upload.setAttribute("aria-label", `Choose picture for ${course.name}`);
      const uploadLabel = node("label", "Choose course picture", "cw-appearance-upload"); uploadLabel.append(upload); details.append(uploadLabel);
      if (previewUrl) { const preview = node("img", undefined, "cw-appearance-preview"); preview.src = previewUrl; preview.alt = `${course.name} picture preview`; details.append(preview); }
      if (pendingFileName) details.append(node("span", pendingFileName, "cw-hub__appearance-help"));
      const save = node("button", "Save", "cw-appearance-secondary"); save.type = "button";
      save.disabled = pendingImageUrl === null;
      save.addEventListener("click", async () => {
        const controls = [...box.querySelectorAll("input,button:not(.cw-appearance-close)")]; controls.forEach(control => { control.disabled = true; });
        status.textContent = "Saving…";
        try {
          const color = ["blue", "lavender", "peach", "mint", "butter", "rose", "sky", "teal", "violet", "orange"].includes(course.color) ? course.color : "blue";
          const saved = await broker("styleCourse", { courseId: course.id, color, imageUrl: pendingImageUrl });
          Object.assign(course, { color: saved.color, image_url: saved.imageUrl });
          const current = state.workspace?.courses?.find(item => item.id === course.id);
          if (current) Object.assign(current, { color: saved.color, image_url: saved.imageUrl });
          pendingImageUrl = null; pendingFileName = ""; render(); renderPicture(); status.textContent = "Saved.";
        } catch (error) { status.textContent = error.message; }
        finally { controls.forEach(control => { control.disabled = false; }); if (backdrop.isConnected) upload.focus(); }
      });
      details.append(save);
      if (previewUrl) {
        const remove = node("button", "Remove picture", "cw-appearance-secondary"); remove.type = "button";
        remove.addEventListener("click", () => { pendingImageUrl = ""; pendingFileName = ""; renderPicture(); }); details.append(remove);
      }
      upload.addEventListener("change", async () => {
        const file = upload.files?.[0]; if (!file) return;
        status.textContent = "Preparing picture…";
        try { pendingImageUrl = await globalThis.CoursewiseCourseImage.prepare(file); pendingFileName = file.name; renderPicture(); status.textContent = "Picture ready. Click Save."; }
        catch (error) { status.textContent = error.message; }
      });
    };
    box.append(node("p", "Choose an image for this course card.", "cw-hub__appearance-help"), details, status);
    renderPicture(); backdrop.append(box); return backdrop;
  }
  function openAppearancePopup(workspace) {
    if (workspace?.courses) state.workspace = workspace;
    document.querySelector(".cw-appearance-backdrop")?.remove();
    const popup = appearancePanel(); document.body.append(popup);
    popup.showModal();
    syncAppearanceModeControls();
    popup.querySelector("select")?.focus();
  }
  function openCoursePicturePopup(courseId) {
    document.querySelector(".cw-appearance-backdrop")?.remove();
    const popup = coursePicturePanel(courseId);
    if (!popup) return;
    document.body.append(popup); popup.showModal();
    popup.querySelector('input[type="file"]')?.focus();
  }
  globalThis.CoursewiseAppearance = { open: openAppearancePopup };
  function maxRailWidth() {
    const wrapper = document.querySelector("#wrapper"), content = document.querySelector("#content"), side = document.querySelector("#right-side-wrapper");
    const card = document.querySelector(".ic-DashboardCard");
    if (!wrapper || !content || !side || !card) return MIN_RAIL_WIDTH;
    const contentStyle = getComputedStyle(content), sideStyle = getComputedStyle(side), cardStyle = getComputedStyle(card);
    const cardWidth = card.getBoundingClientRect().width + parseFloat(cardStyle.marginLeft) + parseFloat(cardStyle.marginRight);
    const reserved = (state.horizontalView ? 420 : 2 * cardWidth) + parseFloat(contentStyle.paddingLeft) + parseFloat(contentStyle.paddingRight) +
      parseFloat(sideStyle.paddingLeft) + parseFloat(sideStyle.paddingRight) + 8;
    return Math.max(MIN_RAIL_WIDTH, Math.floor(document.documentElement.clientWidth - wrapper.getBoundingClientRect().left - reserved));
  }
  function showCollapseTab() {
    const hub = document.querySelector(".cw-hub--rail");
    if (!hub) return;
    if (!document.querySelector(".cw-rail-collapse")) {
      const collapse = node("button", "›", "cw-rail-collapse"); collapse.type = "button";
      collapse.setAttribute("aria-label", "Hide Coursewise sidebar"); collapse.title = "Hide Coursewise sidebar";
      collapse.addEventListener("click", () => collapseRail(true));
      hub.append(collapse);
    }
  }
  function applyHorizontalView() {
    const active = state.horizontalView && route()?.type === "dashboard";
    document.body.classList.toggle("cw-horizontal-view", active);
    document.body.style.setProperty("--cw-horizontal-card-height", `${state.horizontalCardHeight}px`);
    document.body.style.setProperty("--cw-card-zoom", String(state.cardScale / 100));
    if (active) ensureHorizontalResizeHandles();
    else document.querySelectorAll(".cw-horizontal-resize-handle").forEach(handle => handle.remove());
    if (!active && route()?.type === "dashboard") ensureCardResizeHandles();
    else document.querySelectorAll(".cw-card-resize-handle").forEach(handle => handle.remove());
  }
  function clampCardScale(scale) {
    return Math.max(MIN_CARD_SCALE, Math.min(MAX_CARD_SCALE, Math.round(scale)));
  }
  function updateCardScale(scale) {
    state.cardScale = clampCardScale(scale);
    document.body.style.setProperty("--cw-card-zoom", String(state.cardScale / 100));
    document.querySelectorAll(".cw-card-resize-handle").forEach(handle => {
      handle.setAttribute("aria-valuenow", String(state.cardScale));
      handle.setAttribute("aria-valuetext", `${state.cardScale}%`);
    });
  }
  function saveCardScale() {
    viewSaveQueue = viewSaveQueue.then(() => chrome.storage.local.set({ [CARD_SCALE_KEY]: state.cardScale })).catch(() => {});
  }
  function ensureCardResizeHandles() {
    for (const { card } of dashboardCards()) {
      if (card.querySelector(".cw-card-resize-handle")) continue;
      const handle = node("div", undefined, "cw-card-resize-handle");
      handle.setAttribute("role", "slider");
      handle.tabIndex = 0;
      handle.setAttribute("aria-label", "Scale all course cards");
      handle.setAttribute("aria-valuemin", String(MIN_CARD_SCALE));
      handle.setAttribute("aria-valuemax", String(MAX_CARD_SCALE));
      handle.setAttribute("aria-valuenow", String(state.cardScale));
      handle.setAttribute("aria-valuetext", `${state.cardScale}%`);
      handle.title = "Drag diagonally to scale all course cards";
      let startX = 0, startY = 0, startScale = 0, baseWidth = 0, baseHeight = 0;
      handle.addEventListener("pointerdown", event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        startX = event.clientX; startY = event.clientY; startScale = state.cardScale;
        baseWidth = card.getBoundingClientRect().width / (state.cardScale / 100);
        baseHeight = card.getBoundingClientRect().height / (state.cardScale / 100);
        handle.setPointerCapture(event.pointerId);
      });
      handle.addEventListener("pointermove", event => {
        if (!handle.hasPointerCapture(event.pointerId)) return;
        const horizontal = (event.clientX - startX) / baseWidth;
        const vertical = (event.clientY - startY) / baseHeight;
        const change = Math.abs(horizontal) > Math.abs(vertical) ? horizontal : vertical;
        updateCardScale(startScale + change * 100);
      });
      handle.addEventListener("pointerup", event => {
        if (!handle.hasPointerCapture(event.pointerId)) return;
        handle.releasePointerCapture(event.pointerId);
        saveCardScale();
      });
      handle.addEventListener("pointercancel", event => {
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        updateCardScale(startScale);
      });
      handle.addEventListener("keydown", event => {
        const delta = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5, PageUp: 10, PageDown: -10 }[event.key];
        const scale = event.key === "Home" ? MIN_CARD_SCALE : event.key === "End" ? MAX_CARD_SCALE : delta == null ? null : state.cardScale + delta;
        if (scale == null) return;
        event.preventDefault(); event.stopPropagation();
        updateCardScale(scale);
        saveCardScale();
      });
      card.append(handle);
    }
  }
  function clampHorizontalCardHeight(height) {
    return Math.max(MIN_HORIZONTAL_CARD_HEIGHT, Math.min(MAX_HORIZONTAL_CARD_HEIGHT, Math.round(height)));
  }
  function updateHorizontalCardHeight(height) {
    state.horizontalCardHeight = clampHorizontalCardHeight(height);
    document.body.style.setProperty("--cw-horizontal-card-height", `${state.horizontalCardHeight}px`);
    document.querySelectorAll(".cw-horizontal-resize-handle").forEach(handle => handle.setAttribute("aria-valuenow", String(state.horizontalCardHeight)));
  }
  function saveHorizontalCardHeight() {
    viewSaveQueue = viewSaveQueue.then(() => chrome.storage.local.set({ [HORIZONTAL_CARD_HEIGHT_KEY]: state.horizontalCardHeight })).catch(() => {});
  }
  function ensureHorizontalResizeHandles() {
    for (const { card } of dashboardCards()) {
      if (card.querySelector(".cw-horizontal-resize-handle")) continue;
      const handle = node("div", undefined, "cw-horizontal-resize-handle");
      handle.setAttribute("role", "slider");
      handle.setAttribute("tabindex", "0");
      handle.setAttribute("aria-label", "Resize all course cards");
      handle.setAttribute("aria-orientation", "vertical");
      handle.setAttribute("aria-valuemin", String(MIN_HORIZONTAL_CARD_HEIGHT));
      handle.setAttribute("aria-valuemax", String(MAX_HORIZONTAL_CARD_HEIGHT));
      handle.setAttribute("aria-valuenow", String(state.horizontalCardHeight));
      handle.title = "Drag to resize all course cards";
      let startY = 0, startHeight = 0;
      handle.addEventListener("pointerdown", event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        startY = event.clientY; startHeight = state.horizontalCardHeight;
        handle.setPointerCapture(event.pointerId);
      });
      handle.addEventListener("pointermove", event => {
        if (!handle.hasPointerCapture(event.pointerId)) return;
        updateHorizontalCardHeight(startHeight + event.clientY - startY);
      });
      handle.addEventListener("pointerup", event => {
        if (!handle.hasPointerCapture(event.pointerId)) return;
        handle.releasePointerCapture(event.pointerId);
        saveHorizontalCardHeight();
      });
      handle.addEventListener("pointercancel", event => {
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        updateHorizontalCardHeight(startHeight);
      });
      handle.addEventListener("keydown", event => {
        const delta = { ArrowUp: -10, ArrowDown: 10, PageUp: -40, PageDown: 40 }[event.key];
        const height = event.key === "Home" ? MIN_HORIZONTAL_CARD_HEIGHT : event.key === "End" ? MAX_HORIZONTAL_CARD_HEIGHT : delta == null ? null : state.horizontalCardHeight + delta;
        if (height == null) return;
        event.preventDefault(); event.stopPropagation();
        updateHorizontalCardHeight(height);
        saveHorizontalCardHeight();
      });
      card.append(handle);
    }
  }
  let viewSaveQueue = Promise.resolve();
  const pictureMenuTriggers = new WeakSet();
  let pictureMenuCourseId = "";
  function setHorizontalView(enabled) {
    state.horizontalView = enabled;
    applyHorizontalView();
    viewSaveQueue = viewSaveQueue.then(() => chrome.storage.local.set({ cwHorizontalView: enabled })).catch(() => {});
  }
  function addHorizontalViewMenuItem() {
    if (route()?.type !== "dashboard") return;
    for (const menu of document.querySelectorAll('[role="menu"]')) {
      const list = menu.querySelector('[data-testid="list-view-menu-item"]');
      const cards = menu.querySelector('[data-testid="card-view-menu-item"]');
      if (!list || !cards || menu.querySelector('[data-cw-horizontal-menu-item]')) continue;
      const item = list.cloneNode(true);
      item.removeAttribute("id"); item.removeAttribute("aria-labelledby");
      item.removeAttribute("data-testid");
      item.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
      item.dataset.cwHorizontalMenuItem = "true";
      item.setAttribute("aria-label", "Horizontal View");
      item.setAttribute("aria-checked", String(state.horizontalView));
      item.tabIndex = 0;
      // Keep Canvas's menu styling without copying its internal label IDs.
      const label = item.querySelector('span > span:last-child');
      if (label) label.textContent = "Horizontal View";
      else item.textContent = "Horizontal View";
      const icon = item.querySelector('span > span:first-child');
      if (icon && icon !== label) icon.textContent = state.horizontalView ? "✓" : "";
      let selectingHorizontal = false;
      item.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation();
        setHorizontalView(true);
        // Horizontal is a layout of Canvas's native cards, including their actions.
        selectingHorizontal = true;
        cards.click();
        selectingHorizontal = false;
      });
      for (const option of menu.querySelectorAll('[data-testid$="-view-menu-item"], [data-testid="recent-activity-menu-item"]')) {
        option.addEventListener("click", () => { if (!selectingHorizontal) setHorizontalView(false); }, true);
      }
      if (state.horizontalView) {
        cards.setAttribute("aria-checked", "false");
        cards.querySelector('svg[name="IconCheck"]')?.remove();
      }
      list.after(item);
      // Canvas manages only its own React items; include our option in keyboard navigation.
      menu.addEventListener("keydown", event => {
        const options = [...menu.querySelectorAll('[role^="menuitem"]')];
        const index = options.indexOf(document.activeElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault(); event.stopImmediatePropagation();
          const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 :
            (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
          options[next]?.focus();
        } else if (document.activeElement === item && ["Enter", " "].includes(event.key)) {
          event.preventDefault(); event.stopImmediatePropagation(); item.click();
        }
      }, true);
    }
  }
  function addCoursewiseAppearanceMenuItem() {
    if (route()?.type !== "dashboard") return;
    for (const menu of document.querySelectorAll('[role="menu"]')) {
      if (menu.querySelector("[data-cw-appearance-menu-item]")) continue;
      const menuText = menu.textContent.toLowerCase();
      if (!menuText.includes("dashboard view") && !menuText.includes("color overlay")) continue;
      const options = [...menu.querySelectorAll('[role^="menuitem"],button,a')]
        .filter(item => item.textContent.trim());
      const overlay = options.find(option => option.textContent.trim() === "Color Overlay");
      if (!overlay) continue;
      // Clone one menu control, never its surrounding row: the row may contain
      // Color Overlay as well, making both labels one click target.
      const template = options.find(option => option.textContent.trim() === "Recent Activity") || overlay;
      const item = template.cloneNode(true);
      for (const element of [item, ...item.querySelectorAll("*")]) {
        element.removeAttribute("id");
        element.removeAttribute("data-testid");
        element.removeAttribute("aria-labelledby");
        element.removeAttribute("aria-checked");
        element.removeAttribute("aria-selected");
        element.removeAttribute("href");
      }
      item.dataset.cwAppearanceMenuItem = "true";
      item.setAttribute("role", "menuitem");
      item.setAttribute("aria-label", "Coursewise settings");
      item.tabIndex = 0;
      const label = [...item.querySelectorAll("*")].reverse().find(element => !element.children.length && element.textContent.trim());
      if (label) label.textContent = "Coursewise settings";
      else item.textContent = "Coursewise settings";
      item.addEventListener("click", event => {
        event.preventDefault(); event.stopImmediatePropagation();
        openAppearancePopup();
      }, true);
      overlay.after(item);
    }
  }
  function addCoursePictureMenuItem() {
    if (route()?.type !== "dashboard") return;
    for (const { id, card } of dashboardCards()) {
      const trigger = [...card.querySelectorAll("button")].find(button => /choose a color or course nickname or move course card/i.test(`${button.getAttribute("aria-label") || ""} ${button.textContent || ""}`));
      if (!trigger || pictureMenuTriggers.has(trigger)) continue;
      pictureMenuTriggers.add(trigger);
      trigger.addEventListener("click", () => {
        pictureMenuCourseId = id;
        setTimeout(addCoursePictureMenuItem, 100);
      }, true);
    }
    // Do not inspect Canvas' entire dashboard until a course popout is open.
    // This function runs from the page MutationObserver and broad scans here
    // can otherwise make the dashboard appear to hang while it loads.
    if (!pictureMenuCourseId) return;
    const nativePopout = document.querySelector('[class*="view-tabs__container"], [role="tablist"], [role="tabpanel"]');
    if (!nativePopout) {
      pictureMenuCourseId = "";
      return;
    }
    const panels = [...document.querySelectorAll('[role="tabpanel"]')];
    const colorPanel = panels.find(candidate => candidate.textContent.includes("Nickname"))
      || [...document.querySelectorAll("*")].find(candidate => candidate.textContent.trim().startsWith("Nickname") && candidate.textContent.includes("Cancel"));
    let morePanel = panels.find(candidate => candidate !== colorPanel);
    if (!morePanel) {
      const moveOption = [...document.querySelectorAll("*")].find(candidate => candidate.children.length === 0 && candidate.textContent.trim() === "Move down");
      for (let candidate = moveOption?.parentElement; candidate && candidate !== document.body; candidate = candidate.parentElement) {
        if (/Move down/.test(candidate.textContent) && /Move to bottom/.test(candidate.textContent) && /Unfavorite/.test(candidate.textContent)) {
          morePanel = candidate;
          break;
        }
      }
    }
    const moreTab = [...document.querySelectorAll('[role="tab"], button, [tabindex]')].find(tab => /^(Move|More)$/i.test(tab.textContent.trim()));
    if (moreTab) {
      const label = [...moreTab.querySelectorAll("*")].reverse().find(element => !element.children.length && element.textContent.trim());
      if (label) label.textContent = "More";
      else moreTab.textContent = "More";
      moreTab.setAttribute("aria-label", "More");
      if (!moreTab.dataset.cwMoreTabBound) {
        moreTab.dataset.cwMoreTabBound = "true";
        moreTab.addEventListener("click", () => setTimeout(addCoursePictureMenuItem, 50), true);
      }
    }
    if (!morePanel || morePanel.querySelector("[data-cw-course-picture-menu-item]")) return;
    const template = [...(colorPanel?.querySelectorAll("button") || [])].find(item => item.textContent.trim() === "Cancel") || colorPanel?.querySelector("button") || morePanel.querySelector("button");
    if (!template) return;
    const item = template.cloneNode(true);
    for (const element of [item, ...item.querySelectorAll("*")]) {
      element.removeAttribute("id"); element.removeAttribute("data-testid"); element.removeAttribute("aria-labelledby"); element.removeAttribute("aria-checked"); element.removeAttribute("aria-selected"); element.removeAttribute("href");
    }
    item.dataset.cwCoursePictureMenuItem = "true";
    item.setAttribute("aria-label", "Course picture"); item.tabIndex = 0;
    const label = [...item.querySelectorAll("*")].reverse().find(element => !element.children.length && element.textContent.trim());
    if (label) label.textContent = "Course picture"; else item.textContent = "Course picture";
    const courseId = pictureMenuCourseId;
    item.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); openCoursePicturePopup(courseId); }, true);
    morePanel.append(item);
  }
  function applyRailSize() {
    if (state.railCollapsed || route()?.type !== "dashboard") return;
    const wrapper = document.querySelector("#wrapper"), side = document.querySelector("#right-side-wrapper");
    if (!wrapper || !side) return;
    state.railWidth = Math.min(state.railWidth, maxRailWidth());
    wrapper.style.setProperty("--cw-dashboard-left", `${wrapper.getBoundingClientRect().left}px`);
    wrapper.style.setProperty("--cw-rail-width", `${state.railWidth}px`);
    document.querySelector(".cw-hub--rail")?.setAttribute("data-wide", String(state.railWidth >= 420));
    const handle = document.querySelector(".cw-rail-resize-handle");
    if (handle) {
      handle.setAttribute("aria-valuemax", String(maxRailWidth()));
      handle.setAttribute("aria-valuenow", String(state.railWidth));
    }
  }
  let railSaveQueue = Promise.resolve();
  function persistRail() {
    const snapshot = { [RAIL_WIDTH_KEY]: state.railWidth, cwRailCollapsed: state.railCollapsed };
    railSaveQueue = railSaveQueue.then(() => chrome.storage.local.set(snapshot)).catch(() => {});
  }
  function ensureReopenTab() {
    if (!state.railCollapsed || route()?.type !== "dashboard" || document.querySelector(".cw-rail-reopen")) return;
    const reopen = node("button", "‹", "cw-rail-reopen"); reopen.type = "button";
    reopen.setAttribute("aria-label", "Show Coursewise sidebar"); reopen.title = "Show Coursewise sidebar";
    reopen.addEventListener("click", () => { collapseRail(false); renderHub(); });
    document.body.append(reopen);
  }
  function collapseRail(collapsed) {
    state.railCollapsed = collapsed;
    document.body.classList.toggle("cw-organizer-collapsed", collapsed);
    document.querySelector(".cw-rail-collapse")?.remove();
    document.querySelector(".cw-rail-reopen")?.remove();
    if (collapsed) {
      document.querySelector(".cw-hub--rail")?.remove();
      ensureReopenTab();
    } else applyRailSize();
    persistRail();
  }
  function startRailResize(event, onDrag = () => {}, minDistance = 0) {
    if (event.button !== 0) return;
    event.preventDefault();
    const pointerId = event.pointerId, startX = event.clientX, startWidth = state.railWidth;
    // The handle disappears with the rail. Capture on the body so this drag
    // keeps receiving moves until the mouse is released, even after collapse.
    if (!minDistance) document.body.setPointerCapture(pointerId);
    const stop = endEvent => {
      if (endEvent?.pointerId != null && endEvent.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
      document.body.removeEventListener("lostpointercapture", stop);
      if (document.body.hasPointerCapture(pointerId)) document.body.releasePointerCapture(pointerId);
      persistRail();
    };
    const move = moveEvent => {
      if (moveEvent.pointerId !== pointerId || Math.abs(moveEvent.clientX - startX) < minDistance) return;
      if (minDistance && !document.body.hasPointerCapture(pointerId)) document.body.setPointerCapture(pointerId);
      onDrag();
      const rightEdge = document.documentElement.clientWidth;
      if (moveEvent.clientX >= rightEdge - 8) {
        if (!state.railCollapsed) collapseRail(true);
        return;
      }
      if (state.railCollapsed) {
        if (moveEvent.clientX > rightEdge - 24) return;
        state.railWidth = MIN_RAIL_WIDTH;
        collapseRail(false);
        renderHub();
      }
      state.railWidth = Math.min(maxRailWidth(), Math.max(MIN_RAIL_WIDTH, startWidth + startX - moveEvent.clientX));
      applyRailSize();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    document.body.addEventListener("lostpointercapture", stop);
  }
  function railHandle() {
    const handle = node("div", undefined, "cw-rail-resize-handle"); handle.setAttribute("role", "separator"); handle.setAttribute("aria-label", "Resize Coursewise organizer"); handle.title = "Drag or use arrow keys to resize";
    handle.tabIndex = 0;
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-valuemin", String(MIN_RAIL_WIDTH));
    handle.setAttribute("aria-valuemax", String(maxRailWidth()));
    handle.setAttribute("aria-valuenow", String(state.railWidth));
    handle.addEventListener("keydown", event => {
      const delta = { ArrowLeft: 10, ArrowRight: -10, PageUp: 40, PageDown: -40 }[event.key];
      const width = event.key === "Home" ? MIN_RAIL_WIDTH : event.key === "End" ? maxRailWidth() : delta == null ? null : state.railWidth + delta;
      if (width == null) return;
      event.preventDefault(); event.stopPropagation();
      state.railWidth = Math.min(maxRailWidth(), Math.max(MIN_RAIL_WIDTH, width));
      applyRailSize(); persistRail();
    });
    handle.addEventListener("pointerdown", event => startRailResize(event));
    return handle;
  }

  function route() {
    const path = location.pathname;
    if (path === "/" || path === "/dashboard") return { type: "dashboard" };
    const match = /^\/courses\/(\d+)\/?$/.exec(path);
    return match ? { type: "course", id: match[1] } : null;
  }
  function safeApiUrl(input, pathname) {
    try {
      const url = new URL(input, model.ORIGIN);
      return url.origin === model.ORIGIN && url.pathname === pathname && !url.hash ? url : null;
    } catch { return null; }
  }
  async function apiPages(pathname, params, maxPages) {
    let next = new URL(pathname, model.ORIGIN), items = [];
    for (const [key, value] of params) next.searchParams.append(key, value);
    for (let page = 0; page < (maxPages || 2) && next; page++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let response;
      try {
        response = await fetch(next.href, {
          credentials: "same-origin", cache: "no-store",
          headers: { Accept: "application/json" }, signal: controller.signal
        });
      } finally { clearTimeout(timeout); }
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Canvas did not provide this list.");
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("Canvas list format changed.");
      items.push(...data);
      const link = response.headers.get("link") || "";
      const candidate = link.split(",").find(part => /rel="?next"?/.test(part))?.match(/<([^>]+)>/)?.[1];
      next = candidate ? safeApiUrl(candidate, pathname) : null;
    }
    return items;
  }
  async function apiOne(pathname, params) {
    const url = new URL(pathname, model.ORIGIN);
    for (const [key, value] of params) url.searchParams.append(key, value);
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000);
    let response;
    try {
      response = await fetch(url.href, {
        credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json" }, signal: controller.signal
      });
    } finally { clearTimeout(timeout); }
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Canvas did not provide this course.");
    return response.json();
  }
  function dashboardCards() {
    const cards = new Map();
    for (const anchor of document.querySelectorAll('a[href*="/courses/"]')) {
      let url;
      try { url = new URL(anchor.getAttribute("href") || "", location.origin); } catch { continue; }
      const match = /^\/courses\/(\d+)\/?$/.exec(url.pathname);
      if (url.origin !== model.ORIGIN || !match || cards.has(match[1])) continue;
      const card = anchor.closest('.ic-DashboardCard, .DashboardCard, [data-testid="course-card"], .course-card, article');
      if (!card || card.closest("nav,aside")) continue;
      cards.set(match[1], { id: match[1], card });
    }
    return [...cards.values()];
  }
  function visibleIds(current) {
    return current.type === "dashboard" ? [...new Set(dashboardCards().map(item => item.id))].slice(0, 30) : [current.id];
  }
  function placeholder(id) {
    return { id, name: "Canvas course", code: "", grade: { score: null, letter: "" }, url: model.ORIGIN + "/courses/" + id };
  }
  function savedCourse(id) {
    return state.workspace?.courses?.find(course => String(course.canvas_id) === String(id));
  }
  function paintCoursePicture(card, imageUrl) {
    const hero = card.querySelector(".ic-DashboardCard__header_hero");
    const host = card.querySelector(".ic-DashboardCard__header_image") || hero;
    if (!host) return;
    let picture = card.querySelector(".cw-custom-course-picture");
    if (!imageUrl) {
      picture?.remove();
      hero?.classList.remove("cw-custom-course-header");
      host.classList.remove("cw-custom-course-header");
      return;
    }
    hero?.classList.toggle("cw-custom-course-header", hero === host);
    host.classList.add("cw-custom-course-header");
    if (!picture) { picture = node("img", undefined, "cw-custom-course-picture"); picture.alt = ""; }
    if (picture.parentElement !== host) host.prepend(picture);
    if (picture.getAttribute("src") !== imageUrl) picture.src = imageUrl;
  }
  function loadCourseData(id, generation, renderWhenReady = true) {
    if (state.requested.has(id)) return Promise.resolve();
    state.requested.add(id);
    const workPath = "/api/v1/courses/" + id + "/assignments";
    const now = Date.now();
    const start = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
    const end = new Date(now + 86400000).toISOString().slice(0, 10);
    const work = apiPages(workPath, [["bucket", "unsubmitted"], ["include[]", "submission"], ["order_by", "due_at"], ["per_page", "100"]], 3)
      .then(rows => {
        if (generation !== state.generation) return;
        state.work.set(id, model.organizeWork(rows, id));
        state.syncTimes.set(id, new Date().toISOString()); state.healthCache.delete(id);
      }).catch(() => {
        if (generation !== state.generation) return;
        state.errors.set("work:" + id, "Assignments are unavailable for this course.");
      });
    const announcements = apiPages("/api/v1/announcements", [
      ["context_codes[]", "course_" + id], ["start_date", start], ["end_date", end], ["per_page", "100"]
    ], 2).then(rows => {
      if (generation !== state.generation) return;
      state.announcements.set(id, model.organizeAnnouncements(rows, id));
      state.syncTimes.set(id, new Date().toISOString()); state.healthCache.delete(id);
    }).catch(() => {
      if (generation !== state.generation) return;
      state.errors.set("announcements:" + id, "Announcements are unavailable for this course.");
    });
    return Promise.all([work, announcements]).then(() => { if (renderWhenReady && generation === state.generation) render(); });
  }
  async function load() {
    const current = route();
    if (!current || state.loading) return;
    state.loading = true;
    const generation = ++state.generation;
    state.courses.clear(); state.work.clear(); state.announcements.clear(); state.syncTimes.clear(); state.healthCache.clear();
    state.requested.clear(); state.errors.clear();
    render();
    try {
      const rows = await apiPages("/api/v1/courses", [["include[]", "total_scores"], ["per_page", "100"]], 2);
      if (generation !== state.generation) return;
      for (const row of rows) {
        const course = model.courseFor(row);
        if (course) state.courses.set(course.id, course);
      }
      try {
        const enrollments = await apiPages("/api/v1/users/self/enrollments", [["type[]", "StudentEnrollment"], ["per_page", "100"]], 2);
        if (generation !== state.generation) return;
        for (const enrollment of enrollments) {
          const id = model.courseId(enrollment?.course_id);
          const course = state.courses.get(id);
          if (course) state.courses.set(id, model.withEnrollmentGrade(course, enrollment));
        }
      } catch { /* Some schools block enrollment summaries. */ }
      if (current.type === "course" && !state.courses.has(current.id)) {
        try {
          const details = await apiOne("/api/v1/courses/" + current.id, [["include[]", "total_scores"]]);
          const course = model.courseFor(details);
          if (course) state.courses.set(course.id, course);
        } catch { /* The current course may not be available from the API. */ }
      }
      const ids = visibleIds(current);
      for (const id of ids) if (!state.courses.has(id)) state.courses.set(id, placeholder(id));
      render();
      for (let offset = 0; offset < ids.length; offset += 3) {
        await Promise.all(ids.slice(offset, offset + 3).map(id => loadCourseData(id, generation, false)));
        if (generation === state.generation) render();
      }
    } catch {
      if (generation === state.generation) state.errors.set("global", "Canvas could not load this overview. Check your Canvas sign-in, then refresh.");
    } finally {
      if (generation === state.generation) {
        state.loading = false;
        render();
      }
    }
  }
  function deadlineWindowDays() {
    return [1, 3, 7, 14, 30].includes(state.preferences.deadlineWindowDays) ? state.preferences.deadlineWindowDays : 14;
  }
  function deadlineWindowLabel() {
    const days = deadlineWindowDays();
    return days === 1 ? "1 day" : days === 7 ? "1 week" : days === 14 ? "2 weeks" : `${days} days`;
  }
  function nextFuture(id) {
    const now = Date.now(), end = now + deadlineWindowDays() * 86400000;
    return state.work.get(id)?.find(item => { const due = Date.parse(item.dueAt); return due >= now && due <= end; });
  }
  function makeGradeBadge(course, loading = false) {
    const score = course.grade.score;
    const badge = node("span", loading ? "Loading grade…" : score === null ? "Grade —" : String(score) + "%" + (course.grade.letter ? " · " + course.grade.letter : ""), "cw-card-grade");
    badge.dataset.state = loading ? "loading" : score === null ? "unavailable" : "available";
    badge.title = loading ? "Loading current grade from Canvas" : score === null ? "Canvas has not provided a visible current grade." : "Current grade from Canvas";
    return badge;
  }
  function makeDeadline(id) {
    const due = nextFuture(id), box = node("div", undefined, "cw-card-due" + (!due ? " cw-card-due--empty" : ""));
    box.append(node("span", "Next deadline", "cw-card-due__label"));
    if (due) {
      const when = new Date(due.dueAt);
      const day = when.getDate();
      const ordinal = day % 100 >= 11 && day % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[day % 10] || "th");
      const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(when);
      const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(when).replace(/:00(?=\s*[AP]M$)/, "");
      const compactDate = `${month} ${day}${ordinal}${when.getFullYear() === new Date().getFullYear() ? "" : `, ${when.getFullYear()}`}, ${time}`;
      const link = node("a", due.title); link.href = due.url;
      link.title = due.title;
      box.append(link,
        node("span", ":", "cw-card-due__separator"),
        node("span", "Due " + dateTime.format(when) + (due.points !== null ? " · " + due.points + " pts" : ""), "cw-card-due__when"),
        node("span", compactDate + (due.points !== null ? `: ${due.points} ${due.points === 1 ? "point" : "points"}` : ""), "cw-card-due__compact"));
    } else box.append(node("span", state.errors.get("work:" + id) || (state.work.has(id) ? `No assignments due in the next ${deadlineWindowLabel()}` : state.loading ? "Loading upcoming work…" : "Assignments are unavailable for this course.")));
    return box;
  }
  function renderCards() {
    for (const { id, card } of dashboardCards()) {
      paintCoursePicture(card, savedCourse(id)?.image_url || "");
      const loadedCourse = state.courses.get(id);
      const course = loadedCourse || placeholder(id);
      const hero = card.querySelector('.ic-DashboardCard__header_hero, .ic-DashboardCard__header, .DashboardCard__header, .course-card__header') || card;
      hero.style.position = "relative";
      const badge = makeGradeBadge(course, !loadedCourse && state.loading), oldBadge = card.querySelector(".cw-card-grade");
      if (!oldBadge) hero.append(badge);
      else if (oldBadge.textContent !== badge.textContent || oldBadge.dataset.state !== badge.dataset.state) oldBadge.replaceWith(badge);
      const deadline = makeDeadline(id), oldDeadline = card.querySelector(".cw-card-due");
      if (!oldDeadline) card.append(deadline);
      else if (oldDeadline.textContent !== deadline.textContent) oldDeadline.replaceWith(deadline);
      const health = healthFor(id);
      if (health) {
        const header = card.querySelector(".ic-DashboardCard__header") || card;
        const old = card.querySelector(".cw-health-row");
        const label = `${healthNames[health.status]} · ${health.phrase}`;
        if (!old || old.dataset.label !== label) {
          const button = node("button", undefined, `cw-health-row cw-health-row--${health.status}`);
          button.type = "button"; button.dataset.label = label;
          button.setAttribute("aria-label", `Course health for ${course.name}: ${label}. Open details.`);
          button.append(node("strong", healthNames[health.status]), node("span", health.phrase));
          const count = health.urgentCount;
          if (count) button.append(node("em", String(count), "cw-health-count"));
          button.addEventListener("click", event => { event.stopPropagation(); openHealth(id, button); });
          if (old) old.replaceWith(button); else header.append(button);
        }
      } else {
        const old = card.querySelector(".cw-health-row");
        if (state.loading) {
          if (!old?.classList.contains("cw-health-row--loading")) {
            const pending = node("span", "Loading course health…", "cw-health-row cw-health-row--loading");
            pending.setAttribute("role", "status");
            if (old) old.replaceWith(pending);
            else (card.querySelector(".ic-DashboardCard__header") || card).append(pending);
          }
        } else old?.remove();
      }
    }
  }
  function itemsFor(kind, current, includeRead) {
    const ids = visibleIds(current);
    const map = kind === "announcement" ? state.announcements : state.work;
    let items = ids.flatMap(id => map.get(id) || []);
    if (kind !== "announcement") items = items.filter(item => item.kind === kind);
    if (!includeRead) items = items.filter(item => !state.read.has(itemKey(item)));
    if (kind === "announcement") items.sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
    else items.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return a.overdue ? Date.parse(b.dueAt) - Date.parse(a.dueAt) : Date.parse(a.dueAt) - Date.parse(b.dueAt);
    });
    return items;
  }
  function relativeDue(item) {
    const due = new Date(item.dueAt), now = new Date();
    if (item.overdue) return "Overdue";
    if (due.toDateString() === now.toDateString()) return "Due today";
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    if (due.toDateString() === tomorrow.toDateString()) return "Due tomorrow";
    const days = Math.max(1, Math.ceil((due - now) / 86400000));
    return "In " + days + " days";
  }
  function courseLabel(id) {
    const course = state.courses.get(id);
    return course?.code || course?.name || "Canvas course";
  }
  function makeItem(item, kind) {
    const li = node("li", undefined, "cw-hub__item");
    const isRead = state.read.has(itemKey(item));
    if (isRead) li.classList.add("is-read");
    const when = new Date(kind === "announcement" ? item.postedAt : item.dueAt);
    const date = node("div", undefined, "cw-hub__date");
    date.append(node("span", monthOnly.format(when)), node("strong", dayOnly.format(when)));
    const main = node("div", undefined, "cw-hub__item-main");
    const line = node("div", undefined, "cw-hub__item-top");
    const badgeText = kind === "announcement" ? "Update" : (item.overdue ? "Needs attention" : relativeDue(item));
    line.append(node("span", badgeText, "cw-hub__item-tag" + (item.overdue ? " is-overdue" : "")));
    if (kind !== "announcement" && item.points !== null) line.append(node("span", item.points + " pts", "cw-hub__points"));
    main.append(line);
    const link = node("a", item.title, "cw-hub__item-link"); link.href = item.url;
    main.append(link);
    const meta = node("p", undefined, "cw-hub__item-meta");
    meta.append(node("span", courseLabel(item.courseId)), node("span", kind === "announcement" ?
      "Posted " + dateOnly.format(when) : "Due " + dateTime.format(when)));
    main.append(meta);
    li.append(date, main);
    if (kind === "assignment" || kind === "announcement") {
      const check = node("button", isRead ? "↶" : "✓", "cw-hub__check");
      check.type = "button";
      check.setAttribute("aria-label", (isRead ? "Mark as unread: " : "Mark as read and hide: ") + item.title);
      check.title = isRead ? "Restore to Coursewise" : (kind === "announcement" ? "Hide from Coursewise announcements. Canvas is unchanged." : "Hide from Coursewise assignments. Canvas submission is unchanged.");
      check.setAttribute("aria-pressed", String(isRead));
      check.addEventListener("click", () => setRead(item, !isRead));
      li.append(check);
    }
    return li;
  }
  function makeSpaceCard(space, count, first) {
    const button = node("button", undefined, "cw-hub__space cw-hub__space--" + space.tone);
    button.type = "button";
    button.id = "cw-tab-" + space.key;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", "cw-hub-panel");
    button.setAttribute("aria-selected", String(state.active === space.key));
    button.tabIndex = state.active === space.key ? 0 : -1;
    button.append(node("span", space.label, "cw-hub__space-label"), node("strong", !count && state.loading ? "…" : String(count).padStart(2, "0"), "cw-hub__space-count"),
      node("span", space.name, "cw-hub__space-name"), node("span", first ? first.title : state.loading ? "Loading from Canvas…" : "You're caught up here", "cw-hub__space-preview"));
    button.addEventListener("click", () => selectSpace(space.key));
    button.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = spaces.findIndex(value => value.key === space.key);
      const next = event.key === "Home" ? 0 : event.key === "End" ? spaces.length - 1 :
        (index + (event.key === "ArrowRight" ? 1 : -1) + spaces.length) % spaces.length;
      selectSpace(spaces[next].key);
    });
    return button;
  }
  function selectSpace(kind) {
    state.active = kind;
    renderHub();
    document.getElementById("cw-tab-" + kind)?.focus();
  }
  function makeHub(current) {
    const hub = node("section", undefined, "cw-hub" + (current.type === "dashboard" ? " cw-hub--rail" : " cw-hub--course-rail"));
    hub.setAttribute("aria-label", "Coursewise Canvas organizer");
    if (current.type === "dashboard") { hub.dataset.wide = String(state.railWidth >= 420); hub.append(railHandle()); }
    if (current.type === "course") {
      const assignments = itemsFor("assignment", current, true);
      const reviewed = assignments.filter(item => state.read.has(itemKey(item))).length;
      const remaining = assignments.length - reviewed;
      const percent = assignments.length ? Math.round(reviewed / assignments.length * 100) : 0;
      const summary = node("div", undefined, "cw-hub__course-summary");
      const imageUrl = savedCourse(current.id)?.image_url;
      if (imageUrl) {
        const picture = node("img", undefined, "cw-hub__course-picture");
        picture.src = imageUrl; picture.alt = "";
        summary.append(picture);
      }
      const ring = node("div", undefined, "cw-hub__progress");
      ring.style.setProperty("--cw-progress", percent + "%");
      ring.setAttribute("role", "img");
      ring.setAttribute("aria-label", `${reviewed} reviewed, ${remaining} to review out of ${assignments.length} assignments`);
      ring.append(node("strong", assignments.length ? percent + "%" : "—"));
      const copy = node("div", undefined, "cw-hub__course-copy");
      copy.append(node("strong", "Coursewise", "cw-hub__course-name"),
        node("span", state.courses.get(current.id)?.name || "Your course", "cw-hub__course-title"),
        node("span", assignments.length ? `${reviewed} reviewed · ${remaining} to review` : state.loading ? "Loading assignments…" : "No assignments to review", "cw-hub__course-counts"));
      summary.append(ring, copy);
      const toggle = node("button", state.courseExpanded ? "Hide details" : "View details", "cw-hub__course-toggle");
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", String(state.courseExpanded));
      toggle.setAttribute("aria-controls", "cw-hub-course-details");
      toggle.addEventListener("click", () => { state.courseExpanded = !state.courseExpanded; renderHub(); document.querySelector(".cw-hub__course-toggle")?.focus(); });
      summary.append(toggle);
      hub.append(summary);
    }
    if (current.type === "course") {
      const links = node("div", undefined, "cw-hub__course-links");
      for (const [label, path] of [["Canvas grades", "grades"], ["All Canvas assignments", "assignments"], ["Canvas announcements", "announcements"]]) {
        const link = node("a", label); link.href = "/courses/" + current.id + "/" + path;
        links.append(link);
      }
      hub.append(links);
    }
    const toolbar = node("div", undefined, "cw-hub__toolbar");
    toolbar.append(node("span", current.type === "course" ? "Course overview" : "All courses", "cw-hub__scope"));
    if (current.type === "course") {
      const grade = state.courses.get(current.id)?.grade;
      if (grade?.score !== null && grade?.score !== undefined) toolbar.append(node("span", `Grade ${grade.score}%${grade.letter ? ` · ${grade.letter}` : ""}`, "cw-hub__course-grade"));
      const refresh = node("button", "↻", "cw-hub__course-refresh");
      refresh.type = "button"; refresh.disabled = state.loading;
      refresh.setAttribute("aria-label", "Refresh Coursewise course overview");
      refresh.addEventListener("click", load);
      toolbar.append(refresh);
    }
    hub.append(toolbar);
    const statusText = state.errors.get("global") || (state.loading ? "Syncing your Canvas courses…" : "");
    if (statusText) {
      const status = node("p", statusText, "cw-hub__status");
      status.setAttribute("role", "status");
      hub.append(status);
    }
    const cards = node("div", undefined, "cw-hub__spaces");
    cards.setAttribute("role", "tablist");
    cards.setAttribute("aria-label", "Coursewise spaces");
    for (const space of spaces) {
      const items = itemsFor(space.key, current, false);
      cards.append(makeSpaceCard(space, items.length, items[0]));
    }
    hub.append(cards);
    const active = spaces.find(space => space.key === state.active) || spaces[0];
    const panel = node("div", undefined, "cw-hub__panel cw-hub__panel--" + active.tone);
    panel.id = "cw-hub-panel";
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", "cw-tab-" + active.key);
    const panelHead = node("div", undefined, "cw-hub__panel-head");
    const panelTitle = node("div");
    panelTitle.append(node("p", active.label, "cw-hub__panel-kicker"), node("h3", active.name),
      node("p", active.description, "cw-hub__panel-description"));
    const panelTools = node("div", undefined, "cw-hub__panel-tools");
    if (active.key === "assignment") {
      const allAssignments = itemsFor("assignment", current, true);
      const readCount = allAssignments.filter(item => state.read.has(itemKey(item))).length;
      if (readCount) {
        const showRead = node("button", state.showRead ? "Hide read" : "Show read (" + readCount + ")", "cw-hub__read-toggle");
        showRead.type = "button";
        showRead.setAttribute("aria-pressed", String(state.showRead));
        showRead.addEventListener("click", () => {
          state.showRead = !state.showRead;
          renderHub();
          document.querySelector(".cw-hub__read-toggle")?.focus();
        });
        panelTools.append(showRead);
      }
    }
    panelTools.append(node("span", active.key === "announcement" ? "Newest first" : "Due date order", "cw-hub__sort"));
    panelHead.append(panelTitle, panelTools);
    panel.append(panelHead);
    const items = itemsFor(active.key, current, active.key === "assignment" && state.showRead);
    if ((active.key === "assignment" || active.key === "announcement") && state.lastHidden && state.read.has(itemKey(state.lastHidden))) {
      const notice = node("div", undefined, "cw-hub__undo");
      notice.setAttribute("role", "status");
      notice.append(node("span", active.key === "announcement" ? "Announcement marked as read. Canvas is unchanged." : "Assignment marked as read. Canvas work is unchanged."));
      const undo = node("button", "Undo"); undo.type = "button";
      undo.addEventListener("click", () => setRead(state.lastHidden, false));
      notice.append(undo); panel.append(notice);
    }
    if (items.length) {
      const list = node("ul", undefined, "cw-hub__list");
      const limit = state.expanded.has(active.key) ? items.length : 6;
      for (const item of items.slice(0, limit)) list.append(makeItem(item, active.key));
      panel.append(list);
      if (items.length > 6) {
        const more = node("button", state.expanded.has(active.key) ? "Show fewer" : "Show all " + items.length, "cw-hub__more");
        more.type = "button";
        more.addEventListener("click", () => {
          if (state.expanded.has(active.key)) state.expanded.delete(active.key);
          else state.expanded.add(active.key);
          renderHub();
          document.querySelector(".cw-hub__more")?.focus();
        });
        panel.append(more);
      }
    } else {
      const empty = node("div", undefined, "cw-hub__empty");
      empty.append(node("strong", state.loading ? "Finding your " + active.name.toLowerCase() + "…" :
        (active.key === "assignment" || active.key === "announcement") && itemsFor(active.key, current, true).length ? `All ${active.name.toLowerCase()} marked as read` : "Nothing here right now"),
        node("p", state.loading ? "This space fills in as Canvas responds." :
          active.key === "announcement" ? "Recent course updates will appear here, away from deadlines." :
          "Future and recently overdue work will appear here when Canvas provides it."));
      panel.append(empty);
    }
    const failures = [...state.errors.entries()].filter(([key]) => key.startsWith(active.key === "announcement" ? "announcements:" : "work:")).length;
    if (failures) panel.append(node("p", "Canvas could not load this space for " + failures + " course" + (failures === 1 ? "" : "s") + ". You can still use Canvas directly.", "cw-hub__warning"));
    if (state.storageError && active.key === "assignment") panel.append(node("p", "Read choices could not be saved. They may reset when Chrome reloads.", "cw-hub__warning"));
    hub.append(panel);
    hub.append(node("p", "Canvas stays unchanged when you mark an item as read. Nothing here is sent to Coursewise or OpenAI when you browse.", "cw-hub__privacy"));
    if (current.type === "course") {
      const details = node("div", undefined, "cw-hub__course-details");
      details.id = "cw-hub-course-details";
      details.hidden = !state.courseExpanded;
      while (hub.children.length > 1) details.append(hub.children[1]);
      hub.append(details);
    }
    return hub;
  }
  function syncNativeTodo(current) {
    const hasSummary = state.work.size > 0 || state.announcements.size > 0;
    document.body.classList.toggle("cw-organizer-active", current?.type === "dashboard" && hasSummary);
  }
  function renderHub() {
    if (document.body.classList.contains("cw-canvas-app-active")) return;
    const current = route();
    if (!current) return;
    document.body.classList.toggle("cw-organizer-dashboard", current.type === "dashboard");
    if (current.type === "dashboard" && state.railCollapsed) {
      document.body.classList.add("cw-organizer-collapsed");
      document.querySelector(".cw-hub")?.remove();
      document.querySelector(".cw-rail-collapse")?.remove();
      ensureReopenTab();
      return;
    }
    document.body.classList.remove("cw-organizer-collapsed");
    document.querySelector(".cw-rail-reopen")?.remove();
    const host = document.querySelector("#right-side") ||
      document.querySelector("#content, .ic-Layout-contentMain, main");
    if (!host) return;
    if (current.type === "dashboard") { applyRailSize(); document.querySelector(".cw-rail-reopen")?.remove(); }
    const hub = makeHub(current);
    const old = document.querySelector(".cw-hub");
    if (old) old.replaceWith(hub);
    else host.prepend(hub);
    if (current.type === "dashboard") showCollapseTab();
    else document.querySelector(".cw-rail-collapse")?.remove();
    syncNativeTodo(current);
  }
  function render() {
    const current = route();
    if (!current) return;
    if (current.type === "dashboard") { renderCards(); applyHorizontalView(); }
    renderHub();
  }
  function onRoute() {
    if (document.body.classList.contains("cw-canvas-app-active")) {
      document.querySelector(".cw-rail-collapse")?.remove();
      document.querySelector(".cw-rail-reopen")?.remove();
      return;
    }
    addHorizontalViewMenuItem();
    addCoursewiseAppearanceMenuItem();
    addCoursePictureMenuItem();
    const current = route();
    const key = current ? current.type + ":" + (current.id || "") : "unsupported";
    if (key === state.route) {
      if (current?.type === "dashboard") {
        applyHorizontalView();
        if (state.railCollapsed) {
          document.querySelector(".cw-hub")?.remove();
          document.querySelector(".cw-rail-collapse")?.remove();
          ensureReopenTab();
        }
        if (!state.railCollapsed && document.querySelector(".cw-hub--rail") && !document.querySelector(".cw-rail-collapse")) showCollapseTab();
        if (dashboardCards().some(({ id, card }) =>
          (state.courses.has(id) && !card.querySelector(".cw-card-grade")) ||
          Boolean(savedCourse(id)?.image_url) !== Boolean(card.querySelector(".cw-custom-course-picture")))) renderCards();
        for (const id of visibleIds(current)) {
          if (state.courses.has(id) && !state.requested.has(id) && state.requested.size < 30) loadCourseData(id, state.generation);
        }
      }
      if (current && !document.querySelector(".cw-hub")) renderHub();
      return;
    }
    state.route = key; state.generation++; state.loading = false; state.courseExpanded = false;
    document.querySelectorAll(".cw-hub,.cw-rail-collapse,.cw-rail-reopen,.cw-card-grade,.cw-card-due,.cw-health-row,.cw-health-dialog,.cw-dashboard-status,.cw-course-overview,.cw-horizontal-resize-handle,.cw-card-resize-handle").forEach(el => el.remove());
    document.body.classList.remove("cw-organizer-active");
    if (current) load();
  }
  let timer, routeReady = false;
  function enhanceDashboardMenus() {
    if (route()?.type !== "dashboard") return;
    if (document.querySelector('[role="menu"] [data-testid="list-view-menu-item"]')) {
      addHorizontalViewMenuItem();
      addCoursewiseAppearanceMenuItem();
      addCoursePictureMenuItem();
    }
  }
  const observer = new MutationObserver(() => {
    enhanceDashboardMenus();
    addCoursePictureMenuItem();
    if (state.railCollapsed) ensureReopenTab();
    if (routeReady) { clearTimeout(timer); timer = setTimeout(onRoute, 250); }
  });
  async function initialize() {
    document.body.classList.add("cw-menu-ready");
    document.body.classList.add("cw-theme-loading");
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("click", event => {
          const trigger = event.target.closest?.(".ic-DashboardCard__header-button");
      if (!trigger || !/choose a color or course nickname or move course card/i.test(`${trigger.getAttribute("aria-label") || ""} ${trigger.textContent || ""}`)) return;
      const card = trigger.closest('.ic-DashboardCard, .DashboardCard, [data-testid="course-card"], .course-card, article');
      const link = card?.querySelector('a[href*="/courses/"]');
      const match = link && /^\/courses\/(\d+)\/?$/.exec(new URL(link.getAttribute("href") || "", location.origin).pathname);
      if (!match) return;
      pictureMenuCourseId = match[1];
      setTimeout(addCoursePictureMenuItem, 150);
    }, true);
    enhanceDashboardMenus();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.cwCanvasPreferences?.newValue) {
        Object.assign(state.preferences, changes.cwCanvasPreferences.newValue);
        applyBackground(); syncAppearanceModeControls(); renderCards();
      }
      if (area === "local" && (changes.cwLocalSchools || changes.cwCourseAppearanceUpdated)) {
        broker("getWorkspace").then(workspace => { state.workspace = workspace; render(); }).catch(() => {});
      }
      if (area === "local" && changes[HORIZONTAL_CARD_HEIGHT_KEY]) {
        const height = changes[HORIZONTAL_CARD_HEIGHT_KEY].newValue;
        if (Number.isFinite(height)) updateHorizontalCardHeight(height);
      }
      if (area === "local" && changes[CARD_SCALE_KEY]) {
        const scale = changes[CARD_SCALE_KEY].newValue;
        if (Number.isFinite(scale)) updateCardScale(scale);
      }
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (state.preferences.canvasThemeMode === "system") { applyBackground(); syncAppearanceModeControls(); }
    });
    try {
      const saved = await chrome.storage.local.get([READ_KEY, RAIL_WIDTH_KEY, HORIZONTAL_CARD_HEIGHT_KEY, CARD_SCALE_KEY, "cwRailCollapsed", "cwCanvasPreferences", "cwHorizontalView"]);
      if (saved.cwCanvasPreferences) Object.assign(state.preferences, saved.cwCanvasPreferences);
      state.read = new Set(validReadKeys(saved[READ_KEY]));
      if (Number.isFinite(saved[RAIL_WIDTH_KEY])) state.railWidth = Math.max(MIN_RAIL_WIDTH, saved[RAIL_WIDTH_KEY]);
      state.railCollapsed = saved.cwRailCollapsed === true;
      state.horizontalView = saved.cwHorizontalView === true;
      if (Number.isFinite(saved[HORIZONTAL_CARD_HEIGHT_KEY])) state.horizontalCardHeight = clampHorizontalCardHeight(saved[HORIZONTAL_CARD_HEIGHT_KEY]);
      if (Number.isFinite(saved[CARD_SCALE_KEY])) state.cardScale = clampCardScale(saved[CARD_SCALE_KEY]);
    } catch { state.storageError = true; }
    applyBackground();
    document.body.classList.remove("cw-theme-loading");
    broker("getPreferences").then(preferences => {
      state.preferences = preferences; applyBackground(); syncAppearanceModeControls(); renderCards();
    }).catch(() => {});
    broker("getWorkspace").then(workspace => { state.workspace = workspace; render(); }).catch(() => {});
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[READ_KEY]) return;
      state.read = new Set(validReadKeys(changes[READ_KEY].newValue));
      renderHub();
    });
    routeReady = true;
    window.addEventListener("popstate", onRoute);
    window.addEventListener("cw-coursewise-visibility", () => { onRoute(); if (!document.body.classList.contains("cw-canvas-app-active")) renderHub(); });
    window.addEventListener("resize", applyRailSize);
    onRoute();
  }
  let initialized = false;
  function startAfterConsent() {
    if (initialized) return;
    initialized = true;
    initialize();
  }
  chrome.storage.local.get("cwDataConsent").then(saved => { if (saved.cwDataConsent === true) startAfterConsent(); }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.cwDataConsent?.newValue === true) startAfterConsent();
  });
})();
