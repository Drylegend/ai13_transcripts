import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Shell } from "@/components/layout";
import { Skeleton, TooltipProvider } from "@/components/ui";

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

export default function App() {
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
