(function () {
  "use strict";
  const presets = [
    { name: "Sage", original: "#f7faf9", background: "#f2f9f6" },
    { name: "Lavender", original: "#f4f0ff", background: "#f2edff" },
    { name: "Peach", original: "#fff2ea", background: "#fff0e5" },
    { name: "Mint", original: "#edf8f2", background: "#e9f8ef" },
    { name: "Butter", original: "#fff9df", background: "#fff8d7" },
    { name: "Rose", original: "#fff0f4", background: "#ffedf2" },
    { name: "Sky", original: "#edf6ff", background: "#e8f4ff" }
  ];
  const lookup = new Map();
  for (const preset of presets) {
    lookup.set(preset.original, preset);
    lookup.set(preset.background, preset);
  }
  const find = color => lookup.get(String(color || "").toLowerCase());
  const background = color => find(color)?.background || color;
  const sidebarSource = color => find(color)?.original || color;
  const rgb = value => [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
  const hex = channels => "#" + channels.map(value => Math.round(value).toString(16).padStart(2, "0")).join("");
  const blend = (first, second, secondShare) => first.map((value, index) => value * (1 - secondShare) + second[index] * secondShare);
  const luminance = channels => channels.map(value => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = (first, second) => {
    const a = luminance(first);
    const b = luminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const minimumContrast = 4.6;
  const searchThemeCss = `
    :host { --svg-fill: var(--cw-canvas-link); }
    .ajas-search-widget__form input,
    .ajas-search-widget--small form,
    .ajas-search-widget__dropdown,
    .ajas-search-widget__dropdown button {
      background-color: var(--cw-canvas-background) !important;
      border-color: var(--cw-control-outline) !important;
      color: var(--cw-canvas-ink) !important;
    }
    .ajas-search-widget__form input::placeholder { color: var(--cw-canvas-muted) !important; opacity: 1; }
    .ajas-search-widget__form input:focus { border-color: var(--cw-canvas-link) !important; outline-color: var(--cw-canvas-link) !important; }
    .ajas-search-widget__dropdown button:hover { background-color: var(--cw-canvas-background) !important; color: var(--cw-canvas-link) !important; }
  `;
  let searchThemeObserver;
  let previewTheme;
  const themedPreviews = new WeakSet();
  function themeEmbeddedFrames(force = false) {
    if (!previewTheme) return;
    document.querySelectorAll("#preview_frame, iframe.tox-edit-area__iframe").forEach(frame => {
      const send = () => frame.contentWindow?.postMessage(previewTheme, "*");
      if (!themedPreviews.has(frame)) {
        themedPreviews.add(frame);
        frame.addEventListener("load", send);
        send();
      }
      else if (force) send();
    });
  }
  function themeSearchWidgets() {
    document.querySelectorAll("atomic-search-desktop-widget, atomic-search-mobile-widget").forEach(host => {
      const root = host.shadowRoot;
      if (!root || root.querySelector("style[data-cw-search-theme]")) return;
      const style = document.createElement("style");
      style.dataset.cwSearchTheme = "";
      style.textContent = searchThemeCss;
      root.append(style);
    });
  }
  function readableColors(surface) {
    const dark = rgb("#1a2c3d");
    const light = rgb("#f7f9fc");
    let ink = contrast(dark, surface) >= contrast(light, surface) ? dark : light;
    if (contrast(ink, surface) < minimumContrast) ink = luminance(surface) > 0.179 ? [0, 0, 0] : [255, 255, 255];
    let muted = ink;
    for (const share of [0.28, 0.18, 0.08]) {
      const candidate = blend(ink, surface, share);
      if (contrast(candidate, surface) >= minimumContrast) { muted = candidate; break; }
    }
    const linkCandidate = ink === dark ? rgb("#0b507b") : rgb("#d0e8ff");
    const link = contrast(linkCandidate, surface) >= minimumContrast ? linkCandidate : ink;
    return { ink: hex(ink), muted: hex(muted), link: hex(link) };
  }
  function sidebarColor(input) {
    const [r, g, b] = rgb(input).map(value => value / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const lightness = (max + min) / 2;
    const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
    let hue = 0;
    if (delta) {
      if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
      else if (max === g) hue = ((b - r) / delta + 2) / 6;
      else hue = ((r - g) / delta + 4) / 6;
    }
    const targetSaturation = delta ? Math.min(1, saturation + 0.08) : 0;
    const targetLightness = Math.max(0, lightness - 0.20);
    const chroma = (1 - Math.abs(2 * targetLightness - 1)) * targetSaturation;
    const sector = hue * 6;
    const secondary = chroma * (1 - Math.abs(sector % 2 - 1));
    const offset = targetLightness - chroma / 2;
    const parts = sector < 1 ? [chroma, secondary, 0] : sector < 2 ? [secondary, chroma, 0]
      : sector < 3 ? [0, chroma, secondary] : sector < 4 ? [0, secondary, chroma]
      : sector < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary];
    return parts.map(value => (value + offset) * 255);
  }
  function applyTheme(selected, dark) {
    const page = rgb(dark ? "#111923" : background(selected));
    const nav = dark ? rgb("#1b2838") : sidebarColor(sidebarSource(selected));
    const surface = dark ? rgb("#1b2838") : blend(page, [255, 255, 255], 0.22);
    const card = dark ? surface : blend(page, nav, 0.35);
    const navHover = blend(nav, [0, 0, 0], 0.15);
    const pageText = readableColors(page);
    const navText = readableColors(nav);
    const surfaceText = readableColors(surface);
    const cardText = readableColors(card);
    const hoverText = readableColors(navHover);
    const tokens = {
      "--cw-canvas-background": hex(page),
      "--cw-canvas-ink": pageText.ink,
      "--cw-canvas-muted": pageText.muted,
      "--cw-canvas-link": pageText.link,
      "--cw-surface-ink": surfaceText.ink,
      "--cw-surface-muted": surfaceText.muted,
      "--cw-surface-link": surfaceText.link,
      "--cw-card-ink": cardText.ink,
      "--cw-card-muted": cardText.muted,
      "--cw-card-link": cardText.link,
      "--cw-nav-background": hex(nav),
      "--cw-nav-ink": navText.ink,
      "--cw-nav-hover-background": hex(navHover),
      "--cw-nav-hover-ink": hoverText.ink,
      "--cw-nav-highlight": navText.ink === "#f7f9fc" || navText.ink === "#ffffff" ? "rgba(255,255,255,.16)" : "rgba(26,44,61,.12)"
    };
    document.body.classList.toggle("cw-canvas-dark", dark);
    document.body.classList.add("cw-canvas-themed");
    for (const [name, value] of Object.entries(tokens)) document.documentElement.style.setProperty(name, value);
    previewTheme = { type: "cw:preview-theme", tokens, dark };
    themeEmbeddedFrames(true);
    themeSearchWidgets();
    if (!searchThemeObserver) {
      searchThemeObserver = new MutationObserver(() => { themeSearchWidgets(); themeEmbeddedFrames(); });
      searchThemeObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
  }
  globalThis.CoursewiseCanvasPalette = Object.freeze({
    presets: Object.freeze(presets.map(preset => Object.freeze(preset))),
    background,
    sidebarSource,
    applyTheme,
    contrast,
    readableColors
  });
})();
