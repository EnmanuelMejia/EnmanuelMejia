# Deploying the portfolio

The site at https://enmanueldmejia.com is one Cloudflare Worker, `enmanuel-mejia`,
that serves the static files in `./public`.

| Piece | Where |
| --- | --- |
| Pages, styles, images | `public/` (images under `public/assets/` carry a content hash and are cached as immutable) |
| Response headers (CSP, HSTS, framing, caching) | `public/_headers` |
| Canonical-host redirects; `Cache-Control: no-transform` on HTML so the zone's JavaScript Detections does not inject an inline script the CSP would block; Brotli or gzip compression of HTML, which `no-transform` stops the edge from doing | `src/worker.js` |
| Worker, custom domains, asset settings | `wrangler.jsonc` |

## Hostnames

- `enmanueldmejia.com` is canonical and serves the site over HTTPS.
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
node --test                          # redirect and HTML header rules in src/worker.js
npx wrangler@4.141.0 deploy --dry-run
npx wrangler@4.141.0 deploy
```

Wrangler needs a Cloudflare login (`wrangler login`, or `wrangler login --device`
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
