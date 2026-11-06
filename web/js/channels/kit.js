// Shared toolkit for channel adapters (js/channels/*). Every channel gets the same safety checks, so a new channel only
// has to describe how ITS service looks. Nothing here is specific to one broadcaster.

/** Fills {name} placeholders (URL-encoded); unused placeholders become empty. */
export function fillTemplate(template, params = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) => (params[k] == null ? '' : encodeURIComponent(String(params[k]))));
}

/** Returns the origin of `url` if it is https and its host is one of `domains` (or a subdomain); otherwise throws. */
export function allowedOrigin(url, domains) {
  const u = new URL(url);
  const ok = u.protocol === 'https:' && domains.some((d) => u.hostname === d || u.hostname.endsWith('.' + d));
  if (!ok) throw new Error('Unexpected address in the service configuration.');
  return u.origin;
}

/** True for ids that are safe to put in a URL path segment. */
export const safeId = (id) => /^[\w-]+$/.test(String(id ?? ''));

export const str = (v, d = '') => (typeof v === 'string' ? v : d);
export const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/**
 * Anonymous, read-only JSON GET: no cookies, no referrer, only an Accept header (so browsers treat it as a "simple" request).
 * Errors are turned into messages a person can act on.
 */
export async function getJson(fetchFn, url, accept = 'application/json') {
  let res;
  try { res = await fetchFn(url, { headers: { Accept: accept }, credentials: 'omit', referrerPolicy: 'no-referrer' }); }
  catch { throw new Error('Could not reach the catalogue. Check your connection (it may only be reachable in the UK).'); }
  if (!res.ok) throw new Error(`The catalogue returned an error (${res.status}).`);
  try { return await res.json(); } catch { throw new Error('The catalogue sent a response this app could not read.'); }
}

/** Maps a service's own rating code to 0..4 (U, PG, 12, 15, 18). Unknown codes fail CLOSED (4) so the parental lock never leaks. */
export function ratingMapper(table) {
  return (code) => (Object.hasOwn(table, code) ? table[code] : 4);
}
