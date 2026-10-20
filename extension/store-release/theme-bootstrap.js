(function () {
  "use strict";
  const palette = globalThis.CoursewiseCanvasPalette;

  // Read appearance synchronously. The root and incoming body use the actual
  // saved theme without a placeholder color or a hidden-page cover.
  const cached = palette.cachedPreferences();
  if (cached) palette.applyPreferences(cached);
  chrome.storage.local.get(["cwDataConsent", "cwCanvasPreferences"]).then(saved => {
    if (saved.cwDataConsent !== true) { palette.clearTheme(); return; }
    palette.applyPreferences(saved.cwCanvasPreferences);
  }).catch(() => { /* Keep the cached theme if extension storage is unavailable. */ });
})();
