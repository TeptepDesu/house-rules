/**
 * Theme: dark by default, light on request. The server always renders `<html class="dark">`;
 * THEME_INIT_SCRIPT runs in <head> before first paint and drops the class if the visitor
 * chose light, so there's no flash and nothing on the server reads a cookie (which would
 * opt every page out of the static shell under Cache Components).
 */
export const THEME_STORAGE_KEY = "hr-theme";

export type Theme = "dark" | "light";

export const THEME_INIT_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==="light")document.documentElement.classList.remove("dark")}catch(e){}})()`;

/** Client only: switch the live document and remember the choice in this browser. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // storage blocked (private mode): the switch still applies to this page view
  }
}

export function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
