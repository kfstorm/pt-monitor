import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

type ResolvedTheme = Exclude<Theme, "system">;

const STORAGE_KEY = "pt-monitor.theme";
const SCHEME_QUERY = "(prefers-color-scheme: dark)";

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(SCHEME_QUERY).matches;
}

function resolveTheme(theme: Theme, systemDark: boolean): ResolvedTheme {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && isTheme(stored) ? stored : "system";
  });

  useEffect(() => {
    const root = document.documentElement;
    const apply = (systemDark: boolean) => {
      root.classList.toggle("dark", resolveTheme(theme, systemDark) === "dark");
    };
    apply(systemPrefersDark());

    if (theme !== "system") return undefined;

    const media = window.matchMedia(SCHEME_QUERY);
    const onChange = () => apply(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  return [theme, setTheme];
}
