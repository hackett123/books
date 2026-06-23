// Prefix internal links with the configured `base` (e.g. "/books" on GitHub
// Pages). Astro's `base` does NOT rewrite hardcoded hrefs — an href="/shelf"
// resolves to the domain root, losing the base — so every internal link must
// go through this. External URLs (http...) and bare anchors should not.
//
// import.meta.env.BASE_URL is "/books/" when base:"/books", or "/" otherwise.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, ""); // "/books" or ""

/** Join the base path with an internal absolute path (keeps ?query and #hash). */
export function withBase(path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${BASE}${p}` || "/";
}

/** Strip the base off a pathname so it can be compared to bare routes. */
export function stripBase(pathname: string): string {
  if (BASE && pathname.startsWith(BASE)) {
    return pathname.slice(BASE.length) || "/";
  }
  return pathname;
}
