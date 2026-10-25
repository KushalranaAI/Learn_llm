"use client";
import { applyTheme, useResolvedTheme } from "@/lib/theme";
import Icon from "./ui/Icon";

export default function ThemeToggle() {
  const theme = useResolvedTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" className="icon-btn" onClick={() => applyTheme(next)} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      <Icon name={theme === "dark" ? "sun" : "moon"} size={22} />
    </button>
  );
}
