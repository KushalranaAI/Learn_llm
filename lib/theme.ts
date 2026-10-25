// Light / dark / system theme. The inline script in layout.tsx applies it before first paint;
// this module changes it afterwards and lets components (mermaid, canvas widgets) react to it.
import { useSyncExternalStore } from "react";
import { THEME_KEY } from "./theme-script";

export type ThemePref = "system" | "light" | "dark";
const KEY = THEME_KEY;

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* not persisted */
  }
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function isDark(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
}

function subscribe(fn: () => void) {
  const obs = new MutationObserver(fn);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

/** The theme actually showing right now: "light" or "dark". */
export function useResolvedTheme(): "light" | "dark" {
  return useSyncExternalStore(subscribe, () => (isDark() ? "dark" : "light"), () => "dark");
}
