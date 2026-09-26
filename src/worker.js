// Canonical-host gate for the portfolio Worker.
//
// assets.run_worker_first sends every request through this handler before
// static assets are served. Requests for www.enmanueldmejia.com, or for the
// apex over plain HTTP, get one permanent redirect to
// https://enmanueldmejia.com with the path and query preserved. Everything
// else is served from ./public by the assets binding, which also applies
// public/_headers.
//
// HTML responses also get Cache-Control: no-transform. Without it the zone's
// JavaScript Detections injects an inline script into every page, which the
// strict CSP (script-src 'self') blocks, leaving a CSP error in the console.
// Cloudflare skips that injection when the origin sends no-transform.

const CANONICAL_HOST = "enmanueldmejia.com";
const PORTFOLIO_HOSTS = new Set([CANONICAL_HOST, `www.${CANONICAL_HOST}`]);
const HTML_CACHE_CONTROL = "public, max-age=0, must-revalidate, no-transform";

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
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
