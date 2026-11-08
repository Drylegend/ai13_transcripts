const appBase = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "");
const defaultContentBase = `${appBase}/content`.replace(/\/+/g, "/").replace(/\/$/, "");

const rawEnvBaseUrl = import.meta.env.VITE_CONTENT_BASE_URL;
let resolvedContentBase = defaultContentBase;

if (typeof rawEnvBaseUrl === "string" && rawEnvBaseUrl.trim()) {
  const trimmed = rawEnvBaseUrl.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/")) {
    resolvedContentBase = trimmed.replace(/\/+$/, "");
  } else {
    console.warn(
      `[site.ts] Invalid VITE_CONTENT_BASE_URL '${trimmed}'. Expected absolute URL or leading '/'. Falling back to '${defaultContentBase}'.`
    );
  }
}

export const SITE_CONFIG = {
  /** Display name shown in header and page titles */
  name: "Race | AI 13 | Transcripts & Summary",
  /** Tagline shown on the hero section */
  tagline: "Summaries, transcripts, labs & visual notes — all in one place.",
  /** Path to the logo image in /public (null if not yet provided) */
  logoPath: "/logo.png" as string | null,
  /** Base URL for content (public/content in zero-config site mode, or R2 bucket URL) */
  contentBaseUrl: resolvedContentBase,
  /** Whether content URL is configured (always true in zero-config site mode) */
  isConfigured: true,
  /** Prefix for all localStorage keys to avoid collisions */
  storageKeyPrefix: "ai13",
} as const;
