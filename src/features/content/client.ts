import { z } from "zod";
import { SITE_CONFIG } from "@/config/site";
import type { FileRef } from "@/types";

/* ─── Typed Errors ─── */
export class ContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentError";
  }
}

export class NetworkError extends ContentError {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "NetworkError";
  }
}

export class NotFoundError extends ContentError {
  constructor(public readonly path: string) {
    super(`Content not found: ${path}`);
    this.name = "NotFoundError";
  }
}

export class SchemaError extends ContentError {
  constructor(
    public readonly path: string,
    public readonly issues: z.ZodIssue[]
  ) {
    super(
      `Schema validation failed for ${path}: ${issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`
    );
    this.name = "SchemaError";
  }
}

/* ─── Base URL Resolution ─── */
function getBaseUrl(): string {
  const base = SITE_CONFIG.contentBaseUrl || "";
  return base.replace(/\/+$/, "");
}

/**
 * Resolves a full URL for any content asset reference,
 * appending ?v=<hash> for cache-busting.
 */
export function fileUrl(ref: FileRef): string {
  const base = getBaseUrl();
  const cleanPath = ref.path.replace(/^\/+/, "");
  const separator = cleanPath.includes("?") ? "&" : "?";
  const url = base ? `${base}/${cleanPath}` : `/${cleanPath}`;
  return ref.hash ? `${url}${separator}v=${encodeURIComponent(ref.hash)}` : url;
}

function isSpaFallbackHtml(text: string, contentType: string, requestedPath: string): boolean {
  const lowerPath = requestedPath.toLowerCase();
  const isExpectedHtml = lowerPath.endsWith(".html") || lowerPath.endsWith(".htm");
  const trimmed = text.trim();
  const looksLikeHtml =
    contentType.includes("text/html") ||
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html");

  if (!isExpectedHtml && looksLikeHtml) {
    return true;
  }
  if (looksLikeHtml && (text.includes('id="root"') || text.includes("id='root'"))) {
    return true;
  }
  return false;
}

/**
 * Fetches and zod-validates a JSON manifest or document.
 */
export async function fetchJson<T>(
  relativePath: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal
): Promise<T> {
  const base = getBaseUrl();
  const cleanPath = relativePath.replace(/^\/+/, "");
  const url = base ? `${base}/${cleanPath}` : `/${cleanPath}`;

  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin", signal });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    throw new NetworkError(
      `Failed to connect while fetching ${cleanPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (response.status === 404) {
    throw new NotFoundError(cleanPath);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    throw new NetworkError(
      `HTTP ${response.status} ${response.statusText} for ${cleanPath}`,
      response.status
    );
  }

  let text: string;
  try {
    text = await response.text();
  } catch (err: unknown) {
    throw new NetworkError(`Failed to read response body for ${cleanPath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (isSpaFallbackHtml(text, contentType, cleanPath)) {
    throw new NotFoundError(cleanPath);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err: unknown) {
    throw new NetworkError(
      `Invalid JSON in ${cleanPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    throw new SchemaError(cleanPath, result.error.issues);
  }

  return result.data;
}

/**
 * Fetches a text-based document (Markdown, HTML, text) with SPA fallback 404 handling.
 */
export async function fetchText(
  urlOrRef: string | FileRef,
  signal?: AbortSignal
): Promise<string> {
  const url = typeof urlOrRef === "string" ? urlOrRef : fileUrl(urlOrRef);
  const pathForCheck = typeof urlOrRef === "string" ? urlOrRef : urlOrRef.path;

  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin", signal });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new NetworkError(`Failed to fetch ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (response.status === 404) throw new NotFoundError(url);
  if (!response.ok) throw new NetworkError(`HTTP ${response.status} for ${url}`, response.status);

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (isSpaFallbackHtml(text, contentType, pathForCheck)) {
    throw new NotFoundError(url);
  }

  return text;
}

/**
 * Fetches a binary document (DOCX, PDF, image) as Blob with SPA fallback 404 handling.
 */
export async function fetchBlob(
  urlOrRef: string | FileRef,
  signal?: AbortSignal
): Promise<Blob> {
  const url = typeof urlOrRef === "string" ? urlOrRef : fileUrl(urlOrRef);
  const pathForCheck = typeof urlOrRef === "string" ? urlOrRef : urlOrRef.path;

  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin", signal });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new NetworkError(`Failed to fetch ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (response.status === 404) throw new NotFoundError(url);
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("text/html") && !pathForCheck.endsWith(".html") && !pathForCheck.endsWith(".htm")) {
    throw new NotFoundError(url);
  }
  if (!response.ok) throw new NetworkError(`HTTP ${response.status} for ${url}`, response.status);

  return await response.blob();
}
