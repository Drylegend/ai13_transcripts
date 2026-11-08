import { Link, useLocation } from "react-router-dom";
import { Home, BookOpen, Search, Settings } from "lucide-react";
import { cn } from "@/lib/cn";

interface MobileNavProps {
  onOpenDrawer: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
}

export function MobileNav({
  onOpenDrawer,
  onOpenSearch,
  onOpenSettings,
}: MobileNavProps) {
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center justify-around border-t border-(--color-border) bg-(--color-surface)/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
    >
      {/* 1. Home */}
      <Link
        to="/"
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-1 py-1 text-center transition-colors select-none min-h-[44px]",
          isHome
            ? "text-(--color-primary) font-semibold"
            : "text-(--color-text-muted) hover:text-(--color-text)"
        )}
      >
        <Home size={20} className={isHome ? "text-(--color-primary)" : "text-(--color-text-subtle)"} />
        <span className="text-[10px] tracking-wide">Home</span>
      </Link>

      {/* 2. Modules (Drawer trigger) */}
      <button
        type="button"
        onClick={onOpenDrawer}
        className="flex flex-1 flex-col items-center justify-center gap-1 py-1 text-center transition-colors select-none min-h-[44px] text-(--color-text-muted) hover:text-(--color-text)"
      >
        <BookOpen size={20} className="text-(--color-text-subtle)" />
        <span className="text-[10px] tracking-wide">Modules</span>
      </button>

      {/* 3. Search */}
      <button
        type="button"
        onClick={onOpenSearch}
        className="flex flex-1 flex-col items-center justify-center gap-1 py-1 text-center transition-colors select-none min-h-[44px] text-(--color-text-muted) hover:text-(--color-text)"
      >
        <Search size={20} className="text-(--color-text-subtle)" />
        <span className="text-[10px] tracking-wide">Search</span>
      </button>

      {/* 4. Settings */}
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex flex-1 flex-col items-center justify-center gap-1 py-1 text-center transition-colors select-none min-h-[44px] text-(--color-text-muted) hover:text-(--color-text)"
      >
        <Settings size={20} className="text-(--color-text-subtle)" />
        <span className="text-[10px] tracking-wide">Backup</span>
      </button>
    </nav>
  );
}

