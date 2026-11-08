import { useState, useEffect, lazy, Suspense } from "react";
import { Outlet, useLocation, useParams, Link } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IconButton } from "@/components/ui/IconButton";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { ProgressBackupModal } from "./ProgressBackupModal";
import { ProgressBar } from "./ProgressBar";
import { useModule } from "@/features/content/hooks";
import { SITE_CONFIG } from "@/config/site";
import { Menu, Search, Database, X } from "lucide-react";

const CommandPalette = lazy(() =>
  import("./CommandPalette").then((m) => ({ default: m.CommandPalette }))
);

export interface LastVisitedData {
  path: string;
  moduleSlug: string;
  dayNumber?: number;
  title: string;
  timestamp: number;
}

export const LAST_VISITED_KEY = `${SITE_CONFIG.storageKeyPrefix}:last-visited`;

export function getLastVisited(): LastVisitedData | null {
  try {
    const raw = localStorage.getItem(LAST_VISITED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function Shell() {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const location = useLocation();
  const { moduleSlug, dayNumber } = useParams<{
    moduleSlug?: string;
    dayNumber?: string;
  }>();
  const { data: module } = useModule(moduleSlug);

  const [prevPath, setPrevPath] = useState(location.pathname);
  if (prevPath !== location.pathname) {
    setPrevPath(location.pathname);
    setMobileDrawerOpen(false);
  }

  // Scroll to top and focus main heading on route change for a11y
  useEffect(() => {
    window.scrollTo(0, 0);
    const h1 = document.querySelector("h1");
    if (h1) {
      h1.setAttribute("tabindex", "-1");
      h1.style.outline = "none";
      h1.focus({ preventScroll: true });
    }
  }, [location.pathname]);

  // Update document title per page
  useEffect(() => {
    const modTitle = module ? module.title : undefined;
    if (dayNumber && modTitle) {
      document.title = `Day ${dayNumber} · ${modTitle} · ${SITE_CONFIG.name}`;
    } else if (modTitle) {
      document.title = `${modTitle} · ${SITE_CONFIG.name}`;
    } else if (location.pathname.includes("/labs")) {
      document.title = `Labs · ${SITE_CONFIG.name}`;
    } else if (location.pathname.includes("/visual-notes")) {
      document.title = `Visual Notes · ${SITE_CONFIG.name}`;
    } else {
      document.title = SITE_CONFIG.name;
    }
  }, [location.pathname, module, dayNumber]);

  // Remember last visited route in localStorage
  useEffect(() => {
    if (moduleSlug) {
      try {
        const data: LastVisitedData = {
          path: location.pathname,
          moduleSlug,
          dayNumber: dayNumber ? parseInt(dayNumber, 10) : undefined,
          title: module
            ? dayNumber
              ? `${module.title} — Day ${dayNumber}`
              : module.title
            : moduleSlug.replace(/-/g, " "),
          timestamp: Date.now(),
        };
        localStorage.setItem(LAST_VISITED_KEY, JSON.stringify(data));
      } catch {
        // localStorage unavailable
      }
    }
  }, [location.pathname, moduleSlug, dayNumber, module]);

  return (
    <div className="min-h-screen bg-(--color-bg) text-(--color-text) flex flex-col">
      {/* Top Route-change Progress Bar */}
      <ProgressBar />

      {/* Accessible Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-(--color-primary) focus:px-4 focus:py-2 focus:text-white focus:shadow-lg focus:outline-none"
      >
        Skip to content
      </a>

      {/* Fixed 64px Header */}
      <header className="fixed top-0 left-0 right-0 z-40 flex h-16 w-full items-center justify-between gap-3 border-b border-(--color-border) bg-(--color-surface)/85 px-4 backdrop-blur-xl sm:px-6">
        {/* Left: Mobile Drawer Trigger + Logo + Stacked Module Title */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <IconButton
            onClick={() => setMobileDrawerOpen(true)}
            variant="ghost"
            size="sm"
            aria-label="Open sidebar drawer"
            className="lg:hidden shrink-0"
          >
            <Menu size={20} />
          </IconButton>

          <Link to="/" className="flex items-center min-w-0">
            <Logo />
          </Link>

          {/* Stacked Current Module Title (micro-label style like old portal) */}
          <div className="hidden xl:flex flex-col border-l border-(--color-border) pl-3 min-w-0">
            {module ? (
              <>
                <span className="text-[10px] font-bold uppercase tracking-wider text-(--color-primary) truncate">
                  {module.courseCode ?? "Active Module"}
                </span>
                <span className="text-body-sm font-semibold text-(--color-text) truncate max-w-xs md:max-w-sm">
                  {module.title}
                </span>
              </>
            ) : (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-(--color-text-subtle)">
                Course Notes Portal
              </span>
            )}
          </div>
        </div>

        {/* Center: Search Field Button */}
        <div className="hidden sm:block min-w-0 flex-1 max-w-md mx-2 sm:mx-4">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-10 w-full items-center justify-between rounded-xl border border-[rgba(195,198,215,0.4)] bg-(--color-container-low)/70 px-3.5 text-body-sm text-(--color-text-muted) transition-colors hover:border-(--color-border-strong) hover:bg-(--color-container-low) hover:text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-ring)"
            aria-label="Search modules, days, labs, questions..."
          >
            <div className="flex items-center gap-2.5 truncate">
              <Search size={16} className="text-(--color-text-subtle) shrink-0" />
              <span className="truncate">Search modules, days, labs, questions...</span>
            </div>
            <kbd className="hidden lg:inline-block rounded-md bg-(--color-container) px-2 py-0.5 text-[11px] font-mono font-medium text-(--color-text-subtle) shrink-0">
              Ctrl K
            </kbd>
          </button>
        </div>

        {/* Right: ThemeToggle + Settings / Progress & Backup */}
        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle />

          <IconButton
            onClick={() => setSettingsOpen(true)}
            variant="ghost"
            size="sm"
            aria-label="Progress & Backup"
            className="hidden lg:inline-flex text-(--color-text-muted) hover:text-(--color-primary)"
          >
            <Database size={18} />
          </IconButton>
        </div>
      </header>

      {/* Desktop Fixed Sidebar (300px wide, >= 1024px) */}
      <div className="hidden lg:block fixed top-16 left-0 bottom-0 z-30 w-[300px]">
        <Sidebar onSettingsClick={() => setSettingsOpen(true)} />
      </div>

      {/* Mobile Slide-in Drawer via Radix Dialog (< 1024px) */}
      <Dialog.Root open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity lg:hidden animate-in fade-in-0" />
          <Dialog.Content className="fixed top-0 bottom-0 left-0 z-50 w-[84vw] max-w-[320px] bg-(--color-surface) shadow-2xl flex flex-col focus:outline-none lg:hidden animate-in slide-in-from-left duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-(--color-border) px-4 py-3.5">
              <Logo />
              <Dialog.Close asChild>
                <IconButton variant="ghost" size="sm" aria-label="Close navigation">
                  <X size={18} />
                </IconButton>
              </Dialog.Close>
            </div>

            {/* Sidebar content inside mobile drawer */}
            <div className="flex-1 overflow-hidden">
              <Sidebar
                className="w-full border-r-0"
                onSettingsClick={() => {
                  setMobileDrawerOpen(false);
                  setSettingsOpen(true);
                }}
                onLinkClick={() => setMobileDrawerOpen(false)}
              />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-[300px] pt-16 pb-20 lg:pb-8 flex flex-col min-w-0">
        <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none min-w-0">
          <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation (< 1024px) */}
      <MobileNav
        onOpenDrawer={() => setMobileDrawerOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Command Palette Modal */}
      {searchOpen && (
        <Suspense fallback={null}>
          <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
        </Suspense>
      )}

      {/* Progress & Backup Modal */}
      <ProgressBackupModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}
