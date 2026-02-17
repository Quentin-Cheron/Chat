import { useEffect, useState } from "react";

export type ThemeId = "nature" | "tangerine" | "darkmatter" | "clean-slate" | "claude" | "notebook";

const THEME_FONTS: Record<ThemeId, string> = {
  "nature":      '"DM Sans", sans-serif',
  "tangerine":   '"Inter", sans-serif',
  "darkmatter":  '"Geist Mono", ui-monospace, monospace',
  "clean-slate": '"Inter", sans-serif',
  "claude":      'ui-sans-serif, system-ui, -apple-system, sans-serif',
  "notebook":    '"Architects Daughter", sans-serif',
};

export type ThemeDef = {
  id: ThemeId;
  label: string;
  bg: string;
  primary: string;
};

export const THEMES: ThemeDef[] = [
  { id: "nature",      label: "Nature",      bg: "#3a2e1f", primary: "#b89b6a" },
  { id: "tangerine",   label: "Tangerine",   bg: "#1e2235", primary: "#d9603a" },
  { id: "darkmatter",  label: "Darkmatter",  bg: "#131214", primary: "#d4874a" },
  { id: "clean-slate", label: "Clean Slate", bg: "#131a2e", primary: "#6b7ff5" },
  { id: "claude",      label: "Claude",      bg: "#1e1c18", primary: "#c97a45" },
  { id: "notebook",    label: "Notebook",    bg: "#242424", primary: "#c4c4c4" },
];

const STORAGE_KEY = "privatechat_theme_v1";

function applyTheme(id: ThemeId) {
  const html = document.documentElement;
  html.classList.add("dark");
  if (id === "nature") {
    html.removeAttribute("data-theme");
  } else {
    html.setAttribute("data-theme", id);
  }
  // Force font update immediately (CSS var change may not retrigger font-family in all browsers)
  document.body.style.fontFamily = THEME_FONTS[id];
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && THEMES.some((t) => t.id === stored)) return stored as ThemeId;
    } catch { /* ignore */ }
    return "nature";
  });

  useEffect(() => {
    applyTheme(theme);
    try { window.localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  return { theme, setTheme: setThemeState, themes: THEMES };
}
