"use strict";
// Only display preferences are persisted. Sharing credentials never enter storage.
const preferences = {
  get(key, fallback) {
    try {
      return localStorage.getItem(`sharedserver.${key}`) || fallback;
    } catch (_) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`sharedserver.${key}`, value);
    } catch (_) {
      /* In-memory preferences still work. */
    }
  },
};
let themePreference = preferences.get("theme", "system");
let systemTheme;
try {
  systemTheme = matchMedia("(prefers-color-scheme: dark)");
} catch (_) {
  /* CSS has a system fallback. */
}
function applyTheme() {
  if (!["light", "dark", "system"].includes(themePreference))
    themePreference = "system";
  if (themePreference === "system" && !systemTheme) {
    delete document.documentElement.dataset.theme;
    return;
  }
  const theme =
    themePreference === "system"
      ? systemTheme?.matches
        ? "dark"
        : "light"
      : themePreference;
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#09090b" : "#f8fafc");
}
applyTheme();
try {
  systemTheme?.addEventListener("change", applyTheme);
} catch (_) {
  try {
    systemTheme?.addListener?.(applyTheme);
  } catch (_) {
    /* CSS fallback. */
  }
}
