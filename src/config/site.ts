const isProd = import.meta.env.PROD;
const envBaseUrl = import.meta.env.VITE_CONTENT_BASE_URL;
const trimmedBaseUrl = typeof envBaseUrl === "string" ? envBaseUrl.trim() : "";

export const SITE_CONFIG = {
  /** Display name shown in header and page titles */
  name: "Race | AI 13 | Transcripts & Summary",
  /** Tagline shown on the hero section */
  tagline: "Summaries, transcripts, labs & visual notes — all in one place.",
  /** Path to the logo image in /public (null if not yet provided) */
  logoPath: "/logo.png" as string | null,
  /** Base URL for R2-hosted content (manifests, docx, images, etc.) */
  contentBaseUrl: isProd ? trimmedBaseUrl : (trimmedBaseUrl || "/mock-content"),
  /** Whether content URL is configured for production */
  isConfigured: !isProd || Boolean(trimmedBaseUrl),
  /** Prefix for all localStorage keys to avoid collisions */
  storageKeyPrefix: "ai13",
} as const;
