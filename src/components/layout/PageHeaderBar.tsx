import { useNavigate, Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useModule } from "@/features/content/hooks";
import { ArrowLeft } from "lucide-react";

interface PageHeaderBarProps {
  currentPageType?: "module" | "day" | "labs" | "lab-detail" | "visual-notes";
  fallbackBackUrl?: string;
  labNumber?: number | string;
}

export function PageHeaderBar({
  currentPageType,
  fallbackBackUrl,
  labNumber,
}: PageHeaderBarProps) {
  const navigate = useNavigate();
  const { moduleSlug, dayNumber } = useParams<{
    moduleSlug?: string;
    dayNumber?: string;
  }>();
  const { data: module } = useModule(moduleSlug);

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else if (fallbackBackUrl) {
      navigate(fallbackBackUrl);
    } else if (moduleSlug) {
      navigate(`/m/${moduleSlug}`);
    } else {
      navigate("/");
    }
  };

  const moduleTitle = module?.title ?? (moduleSlug ? moduleSlug.replace(/-/g, " ") : "");

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-(--color-border-subtle) pb-4">
      {/* Back button */}
      <Button
        variant="secondary"
        size="sm"
        onClick={handleBack}
        className="gap-1.5 text-body-sm font-semibold"
      >
        <ArrowLeft size={16} />
        Back
      </Button>

      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-(--color-text-subtle) overflow-hidden">
        <Link to="/" className="hover:text-(--color-primary) shrink-0 transition-colors">
          Home
        </Link>
        <span>•</span>

        {moduleSlug && (
          <>
            {currentPageType === "module" ? (
              <span className="text-(--color-primary) truncate max-w-[220px] sm:max-w-md font-bold">
                {moduleTitle}
              </span>
            ) : (
              <Link
                to={`/m/${moduleSlug}`}
                className="hover:text-(--color-primary) truncate max-w-[150px] sm:max-w-[200px] transition-colors"
                title={moduleTitle}
              >
                {moduleTitle}
              </Link>
            )}
          </>
        )}

        {currentPageType === "day" && dayNumber && (
          <>
            <span>•</span>
            <span className="hidden sm:inline">Course Days</span>
            <span className="hidden sm:inline">•</span>
            <span className="text-(--color-primary) font-bold shrink-0">
              Day {dayNumber}
            </span>
          </>
        )}

        {currentPageType === "labs" && (
          <>
            <span>•</span>
            <span className="text-(--color-primary) font-bold shrink-0">
              Lab Exercises
            </span>
          </>
        )}

        {currentPageType === "lab-detail" && (
          <>
            <span>•</span>
            <Link
              to={`/m/${moduleSlug}/labs`}
              className="hover:text-(--color-primary) transition-colors"
            >
              Lab Exercises
            </Link>
            {labNumber !== undefined && (
              <>
                <span>•</span>
                <span className="text-(--color-primary) font-bold shrink-0">
                  Lab {labNumber}
                </span>
              </>
            )}
          </>
        )}

        {currentPageType === "visual-notes" && (
          <>
            <span>•</span>
            <span className="text-(--color-primary) font-bold shrink-0">
              Visual Notes
            </span>
          </>
        )}
      </nav>
    </div>
  );
}

