import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { IconButton } from "@/components/ui";

const CYCLE: Array<"light" | "dark" | "system"> = ["light", "dark", "system"];

const ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

const LABELS = {
  light: "Switch to dark theme",
  dark: "Switch to system theme",
  system: "Switch to light theme",
} as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const Icon = ICONS[theme];

  const next = () => {
    const idx = CYCLE.indexOf(theme);
    const nextTheme = CYCLE[(idx + 1) % CYCLE.length];
    if (nextTheme !== undefined) {
      setTheme(nextTheme);
    }
  };

  return (
    <IconButton onClick={next} aria-label={LABELS[theme]}>
      <Icon size={18} />
    </IconButton>
  );
}

