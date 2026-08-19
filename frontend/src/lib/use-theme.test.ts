import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useTheme } from "@/lib/use-theme";

const STORAGE_KEY = "pt-monitor.theme";

function fakeMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    matches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      listeners.add(listener);
    },
    removeEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      listeners.delete(listener);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  };
  return {
    media,
    setMatches(next: boolean) {
      media.matches = next;
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent);
      }
    },
  };
}

let originalMatchMedia: typeof window.matchMedia;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  originalMatchMedia = window.matchMedia;
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("useTheme", () => {
  it("defaults to system without a stored value", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("system");
  });

  it("reads a stored value and persists changes", () => {
    localStorage.setItem(STORAGE_KEY, "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("dark");

    act(() => {
      result.current[1]("light");
    });
    expect(result.current[0]).toBe("light");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
  });

  it("falls back to system for unknown stored values", () => {
    localStorage.setItem(STORAGE_KEY, "nope");
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("system");
  });

  it("toggles the dark class on <html> when the theme changes", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current[1]("dark");
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      result.current[1]("light");
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("keeps light mode when system prefers light", () => {
    const fake = fakeMatchMedia(false);
    window.matchMedia = () => fake.media as unknown as MediaQueryList;
    renderHook(() => useTheme());

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("follows system scheme changes while in system mode", () => {
    const fake = fakeMatchMedia(false);
    window.matchMedia = () => fake.media as unknown as MediaQueryList;
    renderHook(() => useTheme());

    act(() => {
      fake.setMatches(true);
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("ignores system scheme changes when an explicit theme is set", () => {
    const fake = fakeMatchMedia(false);
    window.matchMedia = () => fake.media as unknown as MediaQueryList;
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current[1]("light");
      fake.setMatches(true);
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
