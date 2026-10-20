(function () {
  "use strict";
  const palette = globalThis.CoursewiseCanvasPalette;
  const root = document.documentElement;

  root.classList.add("cw-canvas-booting");
  root.setAttribute("aria-busy", "true");
  const reveal = () => {
    root.classList.remove("cw-canvas-booting");
    root.removeAttribute("aria-busy");
  };
  // Keep Canvas usable if a content script fails before the organizer starts.
  setTimeout(() => {
    if (!root.classList.contains("cw-canvas-booting")) return;
    root.classList.add("cw-canvas-failed");
    reveal();
  }, 8000);

  const cached = palette.cachedPreferences();
  if (cached) palette.applyPreferences(cached);
  chrome.storage.local.get(["cwDataConsent", "cwCanvasPreferences"]).then(saved => {
    if (saved.cwDataConsent !== true) { palette.clearTheme(); reveal(); return; }
    palette.applyPreferences(saved.cwCanvasPreferences);
  }).catch(() => { /* Keep the cached theme while the organizer starts. */ });
})();
