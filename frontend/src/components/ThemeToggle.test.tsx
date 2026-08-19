import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { ThemeToggle } from "@/components/ThemeToggle";
import i18n from "@/i18n";

const STORAGE_KEY = "pt-monitor.theme";

beforeEach(async () => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  await i18n.changeLanguage("en");
});

describe("ThemeToggle", () => {
  it("opens a menu with light, dark and system options", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: i18n.t("action.theme") }));

    const options = await screen.findAllByRole("menuitemradio");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent(i18n.t("action.theme.light"));
    expect(options[1]).toHaveTextContent(i18n.t("action.theme.dark"));
    expect(options[2]).toHaveTextContent(i18n.t("action.theme.system"));
  });

  it("persists the selected theme and applies it to <html>", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: i18n.t("action.theme") }));
    await user.click(
      await screen.findByRole("menuitemradio", { name: i18n.t("action.theme.dark") }),
    );

    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
