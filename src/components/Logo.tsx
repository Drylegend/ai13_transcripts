import { SITE_CONFIG } from "@/config/site";

export function Logo({ className }: { className?: string }) {
  if (SITE_CONFIG.logoPath) {
    return (
      <div className="flex items-center gap-2.5 min-w-0">
        <img
          src={SITE_CONFIG.logoPath}
          alt="REVA University Logo"
          className={
            className ??
            "h-8 w-auto rounded-md bg-white p-0.5 object-contain shadow-xs shrink-0"
          }
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
        <span className="text-body font-semibold tracking-tight text-(--color-text) sm:text-section truncate min-w-0">
          {SITE_CONFIG.name}
        </span>
      </div>
    );
  }

  return (
    <span className="text-section font-bold tracking-tight text-(--color-text) truncate min-w-0">
      {SITE_CONFIG.name}
    </span>
  );
}
