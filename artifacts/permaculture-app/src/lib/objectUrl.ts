/**
 * Resolve a stored image reference to a renderable URL.
 *
 * - Object-storage paths ("/objects/...") are served by the API at
 *   `${BASE}/api/storage/objects/...` (public-read for enquiry photos,
 *   owner-only for plan renders).
 * - Data URLs and absolute/relative URLs are returned untouched, keeping
 *   backward compatibility with images stored as base64 data URLs.
 */
export function resolveObjectUrl(ref: string | null | undefined): string {
  if (!ref) return "";
  if (ref.startsWith("/objects/")) {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    return `${base}/api/storage${ref}`;
  }
  return ref;
}
