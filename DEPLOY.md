# Deploying the portfolio

This repository contains the portfolio pages and a canonical-host Worker intended for `enmanuel-mejia`. Both portfolio custom domains currently target that Worker. A source check is separate from proving which complete asset bundle is live.

## Release gate observed October 7, 2026

The live Worker also serves `/bootcamps/` and `/assessments/`, which are absent from this repository. Public requests returned `200` on both apex and `www`, a relative `/` canonical URL, and no CSP/HSTS headers on the portfolio HTML. Those observations differ from the canonical-host code and asset headers checked in here. The active cloud version at inspection was `7d4560bf-c9f8-4d26-b31d-ec81de78d69d`, deployed October 6, 2026.

Before replacing the live asset bundle, reconcile its source, preserve the learning hubs and their routes, run the source/browser checks below, and record a fresh target-specific rollback version. This branch prepares portfolio improvements; it does not establish that a complete replacement is safe to deploy. Do not remove a learning hub or an unrelated resource to make the source match.

| Piece | Where |
| --- | --- |
| Pages, styles, images | `public/` (images under `public/assets/` carry a content hash and are cached as immutable) |
| Response headers (CSP, HSTS, framing, caching) | `public/_headers` |
| Canonical-host redirects; `Cache-Control: no-transform` on HTML so the zone's JavaScript Detections does not inject an inline script the CSP would block; Brotli or gzip compression of HTML, which `no-transform` stops the edge from doing | `src/worker.js` |
| Worker, custom domains, asset settings | `wrangler.jsonc` |

## Intended behavior of this source

- `enmanueldmejia.com` is the configured canonical host.
- `https://www.enmanueldmejia.com` answers with one `301` to
  `https://enmanueldmejia.com`, keeping the path and query.
- Plain HTTP is upgraded first by the zone's Always Use HTTPS, on the same
  hostname, before the Worker runs. `http://enmanueldmejia.com` therefore takes
  one hop and `http://www.enmanueldmejia.com` takes two. The Worker's own HTTP
  branch only matters if that zone setting is ever turned off.
- Both hostnames are Workers Custom Domains. Cloudflare creates their DNS
  records and edge certificates, so the zone needs no manual A, AAAA or CNAME
  records for them. Do not add any: a Custom Domain cannot attach to a hostname
  that already has a CNAME.
- `workers_dev` and `preview_urls` are off, so the site has no second public
  hostname.

## Deploy

```sh
npm ci --ignore-scripts
npm run check
npm test                            # canonical-host and HTML header behavior
npm run test:browser                 # local browser accessibility and navigation
npm run deploy:dry-run               # package validation; does not change production
```

After the release gate is satisfied, use the pinned project Wrangler to deploy. Wrangler needs a Cloudflare login (`wrangler login`, or `wrangler login --device`
from a container or remote shell) or a scoped API token in
`CLOUDFLARE_API_TOKEN`. The token needs Workers Scripts Edit on the account and
Workers Routes Edit on the enmanueldmejia.com zone. Never commit credentials.

## Verify

```sh
curl -sSI https://enmanueldmejia.com/            # 200, CSP and HSTS present
curl -sSI https://www.enmanueldmejia.com/        # 301 to https://enmanueldmejia.com/
curl -sSI http://enmanueldmejia.com/             # 301 to https://enmanueldmejia.com/
curl -sS -o /dev/null -D - -H 'Accept-Encoding: br, gzip' https://enmanueldmejia.com/
                                                 # content-encoding br or gzip, no-transform
```

## Roll back

- Code: `npx wrangler deployments list`, then
  `npx wrangler rollback <version-id>` to put a previous upload back into service.
- Source: `git revert <commit>` as a new commit, then deploy. Do not force-push.
- Removing a Custom Domain (dashboard: Worker, then Settings, then Domains & Routes)
  leaves its edge certificate behind under SSL/TLS, then Edge Certificates.
  Delete that certificate by hand if the hostname is retired.
