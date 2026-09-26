// Run with: node --test
// Checks the canonical-host redirects in src/worker.js without Wrangler.
import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../src/worker.js";

const served = new Response("asset", { status: 200 });
const env = { ASSETS: { fetch: async () => served } };
const run = (url) => worker.fetch(new Request(url), env);

test("apex over HTTPS is served from static assets", async () => {
  assert.equal(await run("https://enmanueldmejia.com/"), served);
  assert.equal(await run("https://enmanueldmejia.com/sitemap.xml"), served);
});

test("www redirects permanently to the apex, keeping path and query", async () => {
  const res = await run("https://www.enmanueldmejia.com/?ref=card");
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("location"), "https://enmanueldmejia.com/?ref=card");

  const deep = await run("https://www.enmanueldmejia.com/sitemap.xml?a=b");
  assert.equal(deep.headers.get("location"), "https://enmanueldmejia.com/sitemap.xml?a=b");
});

test("plain HTTP on either hostname lands on HTTPS apex in one hop", async () => {
  for (const url of ["http://enmanueldmejia.com/", "http://www.enmanueldmejia.com/"]) {
    const res = await run(url);
    assert.equal(res.status, 301);
    assert.equal(res.headers.get("location"), "https://enmanueldmejia.com/");
  }
});

test("redirects are bounded in browser caches", async () => {
  const res = await run("https://www.enmanueldmejia.com/");
  assert.equal(res.headers.get("cache-control"), "public, max-age=3600");
});

test("HTML keeps its status and headers and opts out of edge script injection", async () => {
  const html = (status) => ({
    ASSETS: {
      fetch: async () =>
        new Response("<!doctype html>", {
          status,
          headers: {
            "Content-Type": "text/html",
            "Cache-Control": "public, max-age=0, must-revalidate",
            "Content-Security-Policy": "default-src 'self'",
          },
        }),
    },
  });
  for (const status of [200, 404]) {
    const res = await worker.fetch(new Request("https://enmanueldmejia.com/"), html(status));
    assert.equal(res.status, status);
    assert.equal(res.headers.get("cache-control"), "public, max-age=0, must-revalidate, no-transform");
    assert.equal(res.headers.get("content-security-policy"), "default-src 'self'");
  }
});

// An HTML asset response as the assets binding returns it.
const htmlAsset = (status = 200, extra = {}) => ({
  ASSETS: {
    fetch: async () =>
      new Response(status === 304 ? null : "<!doctype html>", {
        status,
        headers: { "Content-Type": "text/html", "Content-Length": "15", ETag: '"abc"', ...extra },
      }),
  },
});
const getHtml = (env, acceptEncoding) =>
  worker.fetch(
    new Request("https://enmanueldmejia.com/", {
      headers: acceptEncoding === undefined ? {} : { "Accept-Encoding": acceptEncoding },
    }),
    env,
  );

test("HTML is compressed with the best encoding the client accepts", async () => {
  const cases = [
    ["gzip, deflate, br, zstd", "br"],
    ["gzip", "gzip"],
    ["br;q=0.5, gzip", "gzip"],
    ["gzip;q=0, br", "br"],
    ["*", "br"],
    ["deflate, identity", null],
    ["br;q=0, gzip;q=0", null],
    [undefined, null],
  ];
  for (const [accept, expected] of cases) {
    const res = await getHtml(htmlAsset(), accept);
    const label = `Accept-Encoding: ${accept}`;
    assert.equal(res.headers.get("content-encoding"), expected, label);
    assert.equal(res.headers.get("vary"), "Accept-Encoding", label);
    // The runtime sizes the compressed body itself, and the ETag of the stored
    // file is only a weak validator for the compressed bytes.
    assert.equal(res.headers.get("content-length"), expected ? null : "15", label);
    assert.equal(res.headers.get("etag"), expected ? 'W/"abc"' : '"abc"', label);
  }
  for (const status of [200, 404]) {
    assert.equal((await getHtml(htmlAsset(status), "br")).headers.get("content-encoding"), "br");
  }
});

test("the visitor's own Accept-Encoding wins over the header Cloudflare rewrote", async () => {
  const withClient = (clientAcceptEncoding) => {
    const request = new Request("https://enmanueldmejia.com/", { headers: { "Accept-Encoding": "gzip, br" } });
    request.cf = { clientAcceptEncoding };
    return worker.fetch(request, htmlAsset());
  };
  assert.equal((await withClient("gzip, deflate")).headers.get("content-encoding"), "gzip");
  assert.equal((await withClient("br, gzip")).headers.get("content-encoding"), "br");
  assert.equal((await withClient("")).headers.get("content-encoding"), null);
  assert.equal((await withClient("identity")).headers.get("content-encoding"), null);
});

test("HTML without a full body, or already encoded, is not re-encoded", async () => {
  const notModified = await getHtml(htmlAsset(304), "br");
  assert.equal(notModified.status, 304);
  assert.equal(notModified.headers.get("content-encoding"), null);
  assert.equal(notModified.headers.get("etag"), '"abc"');
  assert.equal(notModified.headers.get("vary"), "Accept-Encoding");

  const head = await worker.fetch(
    new Request("https://enmanueldmejia.com/", { method: "HEAD", headers: { "Accept-Encoding": "br" } }),
    { ASSETS: { fetch: async () => new Response(null, { headers: { "Content-Type": "text/html" } }) } },
  );
  assert.equal(head.headers.get("content-encoding"), null);

  const encoded = await getHtml(htmlAsset(200, { "Content-Encoding": "gzip", Vary: "Origin" }), "br");
  assert.equal(encoded.headers.get("content-encoding"), "gzip");
  assert.equal(encoded.headers.get("vary"), "Origin, Accept-Encoding");
  assert.equal(encoded.headers.get("etag"), '"abc"');
});

test("non-HTML assets pass through untouched", async () => {
  const image = new Response("x", { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" } });
  const res = await worker.fetch(new Request("https://enmanueldmejia.com/assets/a.webp"), { ASSETS: { fetch: async () => image } });
  assert.equal(res, image);
});

test("other hosts, such as local development, are never redirected", async () => {
  assert.equal(await run("http://127.0.0.1:8787/"), served);
  assert.equal(await run("http://localhost:8787/"), served);
});
