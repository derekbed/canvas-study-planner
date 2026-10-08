(function () {
  "use strict";
  if (window === window.top) return;
  window.addEventListener("message", event => {
    if (event.origin !== "https://canvas.upenn.edu" || event.source !== window.parent) return;
    const theme = event.data;
    if (theme?.type !== "cw:preview-theme" || !theme.tokens || typeof theme.tokens !== "object") return;
    for (const [name, value] of Object.entries(theme.tokens)) {
      if (/^--cw-[a-z-]+$/.test(name) && typeof value === "string") document.documentElement.style.setProperty(name, value);
    }
    document.body.classList.add("cw-canvas-themed");
    document.body.classList.toggle("cw-canvas-dark", theme.dark === true);
  });
})();
