import { useState, lazy, Suspense } from "react";
import { Link, useParams } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IconButton } from "@/components/ui/IconButton";
import { useModule } from "@/features/content/hooks";
import { Search, Menu } from "lucide-react";

const CommandPalette = lazy(() =>
  import("./CommandPalette").then((m) => ({ default: m.CommandPalette }))
);

interface HeaderProps {
  onToggleMobileMenu?: () => void;
  showMenuButton?: boolean;
}

export function Header({
  onToggleMobileMenu,
  showMenuButton = false,
}: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const { moduleSlug } = useParams<{ moduleSlug?: string }>();
  const { data: module } = useModule(moduleSlug);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-(--spacing-header-h) w-full items-center justify-between gap-3 border-b border-(--color-border) bg-(--color-surface)/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
        {/* Left: Mobile Toggle + Logo + Module Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {showMenuButton && (
            <IconButton
              onClick={onToggleMobileMenu}
              variant="ghost"
              size="sm"
              aria-label="Open navigation menu"
              className="lg:hidden shrink-0"
            >
              <Menu size={20} />
            </IconButton>
          )}

          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            <Logo />
          </Link>

          {module && (
            <div className="hidden xl:flex items-center gap-2 border-l border-(--color-border) pl-3 min-w-0">
              <span className="text-body-sm font-semibold text-(--color-text) line-clamp-1 max-w-[200px] xl:max-w-xs">
                {module.title}
              </span>
            </div>
          )}
        </div>

        {/* Right: Search Bar Trigger + Theme Toggle */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex h-9 items-center gap-2.5 rounded-lg border border-(--color-border) bg-(--color-container-low)/60 px-3 text-body-sm text-(--color-text-muted) transition-colors hover:border-(--color-border-strong) hover:bg-(--color-container-low) hover:text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-ring)"
            aria-label="Search content"
          >
            <Search size={15} className="text-(--color-text-subtle)" />
            <span className="truncate">Search notes...</span>
            <kbd className="hidden lg:inline-block rounded bg-(--color-container) px-1.5 py-0.5 text-[10px] font-mono font-medium text-(--color-text-subtle)">
              ⌘K
            </kbd>
          </button>

          <ThemeToggle />
        </div>
      </header>

      {searchOpen && (
        <Suspense fallback={null}>
          <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
        </Suspense>
      )}
    </>
  );
}
