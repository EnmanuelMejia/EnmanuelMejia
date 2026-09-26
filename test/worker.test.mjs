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

test("non-HTML assets pass through untouched", async () => {
  const image = new Response("x", { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" } });
  const res = await worker.fetch(new Request("https://enmanueldmejia.com/assets/a.webp"), { ASSETS: { fetch: async () => image } });
  assert.equal(res, image);
});

test("other hosts, such as local development, are never redirected", async () => {
  assert.equal(await run("http://127.0.0.1:8787/"), served);
  assert.equal(await run("http://localhost:8787/"), served);
});
