// Canonical-host gate for the portfolio Worker.
//
// assets.run_worker_first sends every request through this handler before
// static assets are served. Requests for www.enmanueldmejia.com, or for the
// apex over plain HTTP, get one permanent redirect to
// https://enmanueldmejia.com with the path and query preserved. (In production
// the zone's Always Use HTTPS upgrades plain HTTP before this runs; the HTTP
// branch is the fallback if that setting is turned off.) Everything
// else is served from ./public by the assets binding, which also applies
// public/_headers.
//
// HTML responses also get Cache-Control: no-transform. Without it the zone's
// JavaScript Detections injects an inline script into every page, which the
// strict CSP (script-src 'self') blocks, leaving a CSP error in the console.
// Cloudflare skips that injection when the origin sends no-transform.
//
// no-transform also switches off Cloudflare's edge compression, so the Worker
// compresses HTML itself: it sets Content-Encoding to Brotli or gzip, and the
// Workers runtime compresses the body to match as it is sent. The choice is
// made from the visitor's own Accept-Encoding (request.cf.clientAcceptEncoding),
// because Cloudflare rewrites the request header to a canonical value before
// the Worker runs. The ETag becomes weak, because the compressed bytes differ
// from the stored file.

const CANONICAL_HOST = "enmanueldmejia.com";
const PORTFOLIO_HOSTS = new Set([CANONICAL_HOST, `www.${CANONICAL_HOST}`]);
const HTML_CACHE_CONTROL = "public, max-age=0, must-revalidate, no-transform";
// Only full representations are compressed; 206/304 and bodiless responses pass as-is.
const COMPRESSIBLE_STATUS = new Set([200, 404]);

// "br" or "gzip", whichever the client ranks higher (Brotli on a tie), or
// null when it accepts neither.
function negotiateEncoding(acceptEncoding) {
  const quality = new Map();
  for (const entry of (acceptEncoding || "").toLowerCase().split(",")) {
    const [coding, ...params] = entry.split(";").map((part) => part.trim());
    if (!coding) continue;
    const q = params.find((param) => param.startsWith("q="));
    const value = q ? Number(q.slice(2)) : 1;
    quality.set(coding, Number.isFinite(value) ? value : 0);
  }
  const rank = (coding) => quality.get(coding) ?? quality.get("*") ?? 0;
  const br = rank("br");
  const gzip = rank("gzip");
  if (br <= 0 && gzip <= 0) return null;
  return br >= gzip ? "br" : "gzip";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (
      PORTFOLIO_HOSTS.has(url.hostname) &&
      (url.hostname !== CANONICAL_HOST || url.protocol !== "https:")
    ) {
      url.protocol = "https:";
      url.hostname = CANONICAL_HOST;
      url.port = "";
      return new Response(null, {
        status: 301,
        headers: {
          Location: url.toString(),
          // Browsers may cache a 301 indefinitely; bound it so a mistake here
          // can be corrected within the hour.
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    const response = await env.ASSETS.fetch(request);
    const type = response.headers.get("Content-Type") || "";
    if (!type.startsWith("text/html")) return response;

    const headers = new Headers(response.headers);
    headers.set("Cache-Control", HTML_CACHE_CONTROL);
    if (!/(^|,)\s*(accept-encoding|\*)\s*(,|$)/i.test(headers.get("Vary") || "")) {
      headers.append("Vary", "Accept-Encoding");
    }

    const encoding =
      response.body &&
      COMPRESSIBLE_STATUS.has(response.status) &&
      !headers.has("Content-Encoding")
        ? negotiateEncoding(
            request.cf?.clientAcceptEncoding ?? request.headers.get("Accept-Encoding"),
          )
        : null;
    if (encoding) {
      headers.set("Content-Encoding", encoding);
      headers.delete("Content-Length");
      const etag = headers.get("ETag");
      if (etag && !etag.startsWith("W/")) headers.set("ETag", `W/${etag}`);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
