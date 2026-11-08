import { SITE_CONFIG } from "@/config/site";

export function Logo({ className }: { className?: string }) {
  if (SITE_CONFIG.logoPath) {
    return (
      <div className="flex items-center gap-2.5">
        <img
          src={SITE_CONFIG.logoPath}
          alt="REVA University Logo"
          className={
            className ??
            "h-8 w-auto rounded-md bg-white p-0.5 object-contain shadow-xs"
          }
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
        <span className="text-body font-semibold tracking-tight text-(--color-text) sm:text-section">
          {SITE_CONFIG.name}
        </span>
      </div>
    );
  }

  return (
    <span className="text-section font-bold tracking-tight text-(--color-text)">
      {SITE_CONFIG.name}
    </span>
  );
}
