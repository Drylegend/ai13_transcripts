import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Shell } from "@/components/layout";
import { Skeleton, TooltipProvider } from "@/components/ui";
import { SITE_CONFIG } from "@/config/site";

/* ── Lazy-loaded route pages ── */
const HomePage = lazy(() => import("@/pages/HomePage"));
const ModulePage = lazy(() => import("@/pages/ModulePage"));
const DayPage = lazy(() => import("@/pages/DayPage"));
const LabsPage = lazy(() => import("@/pages/LabsPage"));
const LabDetailPage = lazy(() => import("@/pages/LabDetailPage"));
const VisualNotesPage = lazy(() => import("@/pages/VisualNotesPage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));

function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}

function ConfigErrorPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-(--color-bg) p-6 text-(--color-text)">
      <div className="w-full max-w-lg rounded-2xl border border-red-500/20 bg-(--color-container-lowest) p-8 shadow-xl">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-(--color-text)">
          Content URL not configured
        </h1>
        <p className="mt-3 text-sm text-(--color-text-muted)">
          The production environment variable{" "}
          <code className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-300">
            VITE_CONTENT_BASE_URL
          </code>{" "}
          is missing or empty.
        </p>
        <p className="mt-2 text-sm text-(--color-text-muted)">
          Please configure <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">VITE_CONTENT_BASE_URL</code> in your Cloudflare Pages dashboard or hosting environment to point to your Cloudflare R2 bucket public URL or CDN.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  if (!SITE_CONFIG.isConfigured) {
    return (
      <ThemeProvider>
        <ConfigErrorPage />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={200}>
        <BrowserRouter>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route element={<Shell />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/m/:moduleSlug" element={<ModulePage />} />
                <Route
                  path="/m/:moduleSlug/day/:dayNumber"
                  element={<DayPage />}
                />
                <Route path="/m/:moduleSlug/labs" element={<LabsPage />} />
                <Route
                  path="/m/:moduleSlug/labs/:labId"
                  element={<LabDetailPage />}
                />
                <Route
                  path="/m/:moduleSlug/visual-notes"
                  element={<VisualNotesPage />}
                />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  );
}
