(function () {
  "use strict";
  const palette = globalThis.CoursewiseCanvasPalette;
  function apply(preferences) {
    const selected = /^#[0-9a-f]{6}$/i.test(preferences?.canvasBackground) ? preferences.canvasBackground : "#f7faf9";
    const mode = ["light", "dark", "system"].includes(preferences?.canvasThemeMode) ? preferences.canvasThemeMode : "light";
    const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    palette.applyTheme(selected, dark, mode);
  }

  // Read appearance synchronously. The root and incoming body use the actual
  // saved theme without a placeholder color or a hidden-page cover.
  const cached = palette.cachedPreferences();
  if (cached) apply(cached);
  chrome.storage.local.get(["cwDataConsent", "cwCanvasPreferences"]).then(saved => {
    if (saved.cwDataConsent !== true) { palette.clearTheme(); return; }
    apply(saved.cwCanvasPreferences);
  }).catch(() => { /* Keep the cached theme if extension storage is unavailable. */ });
})();
