/**
 * One person, one LinkedIn key.
 *
 * The same profile arrives written a dozen ways — http or https, with or
 * without www, country subdomains (be.linkedin.com), tracking queries, trailing
 * slashes, uppercase slugs. `linkedinKey` collapses all of them to a single
 * canonical form ("in/laurent-thierry") so that deduplication, suppression and
 * the registration merge all agree on identity, the way lowercasing does for
 * email addresses.
 */

/**
 * Normalise a pasted LinkedIn URL to a stable key, or null when the input is
 * not recognisably a LinkedIn profile. Null means "treat as absent" — a
 * mangled URL must never become a unique key that blocks later imports.
 */
export function linkedinKey(raw: string | null | undefined): string | null {
  const input = (raw ?? "").trim();
  if (!input) return null;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;

  // Profile paths: /in/<slug> (public), /pub/<slug>/... (legacy),
  // /sales/lead/<id> and /sales/people/<id> (Sales Navigator).
  const segments = url.pathname.split("/").filter(Boolean);
  if (!segments.length) return null;

  const kind = segments[0]!.toLowerCase();
  if (kind === "in" && segments[1]) {
    return `in/${decodeSlug(segments[1])}`;
  }
  if (kind === "pub" && segments[1]) {
    return `pub/${decodeSlug(segments.slice(1).join("/"))}`;
  }
  if (kind === "sales" && (segments[1] === "lead" || segments[1] === "people") && segments[2]) {
    // Sales Navigator ids often end in a comma-separated tail — keep the id only.
    return `sales/${segments[2].split(",")[0]!.toLowerCase()}`;
  }
  return null;
}

function decodeSlug(slug: string): string {
  try {
    return decodeURIComponent(slug).toLowerCase().replace(/\/+$/, "");
  } catch {
    return slug.toLowerCase().replace(/\/+$/, "");
  }
}

/** A display-friendly URL rebuilt from a key, for rows imported without one. */
export function linkedinUrlFromKey(key: string): string {
  return `https://www.linkedin.com/${key}`;
}
