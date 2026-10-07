import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const publicRoot = resolve('public');
const html = await readFile(resolve(publicRoot, 'index.html'), 'utf8');
const pages = ['index.html', '404.html'];
let references = 0;
for (const page of pages) {
  const content = await readFile(resolve(publicRoot, page), 'utf8');
  assert.match(content, /<html lang="en">/);
  assert.equal((content.match(/<h1(?:\s|>)/g) || []).length, 1, `${page}: one main heading`);
  for (const [, url] of content.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(?:https?:|mailto:|data:)/i.test(url)) continue;
    if (url.startsWith('#')) {
      assert.ok(content.includes(`id="${url.slice(1)}"`), `${page}: valid fragment ${url}`);
      continue;
    }
    if (url === '/') continue;
    const path = resolve(publicRoot, url.replace(/^\//, '').split(/[?#]/)[0]);
    assert.ok(!relative(publicRoot, path).startsWith('..'), 'reference remains under public/');
    assert.ok((await stat(path)).isFile(), `${page}: asset exists ${url}`);
    references++;
  }
  for (const [, image] of content.matchAll(/<img\b([^>]+)>/g)) {
    assert.match(image, /\balt="[^"]*"/);
    assert.match(image, /\bwidth="\d+"/);
    assert.match(image, /\bheight="\d+"/);
  }
}
const person = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
assert.equal(person.email, 'mailto:mejiaenmanueld@gmail.com');
assert.equal(person.url, 'https://enmanueldmejia.com/');
assert.match(html, /<main id="main" tabindex="-1">/);
assert.match(html, /rel="canonical" href="https:\/\/enmanueldmejia\.com\/"/);
assert.match(html, /href="mailto:mejiaenmanueld@gmail\.com"/);
assert.doesNotMatch(html + await readFile('README.md', 'utf8'), /@[\w.-]*(?:pm\.me|proton(?:mail)?\.com)\b/i);
const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
assert.equal(config.name, 'enmanuel-mejia');
assert.equal(config.assets.binding, 'ASSETS');
assert.deepEqual(config.routes.map(x => x.pattern).sort(), ['enmanueldmejia.com', 'www.enmanueldmejia.com']);
console.log(`Portfolio source validation passed: ${pages.length} pages, ${references} local references, shared public contact and domain configuration.`);
