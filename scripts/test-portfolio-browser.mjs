import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const publicRoot = resolve('public');
const output = resolve('test-results');
await mkdir(output, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.xml': 'application/xml', '.txt': 'text/plain' };
const headerFile = await readFile(resolve(publicRoot, '_headers'), 'utf8');
const headers = Object.fromEntries(headerFile.split('/assets/*')[0].split('\n').filter(line => /^  [\w-]+:/.test(line)).map(line => {
  const index = line.indexOf(':');
  return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
}));
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = resolve(publicRoot, pathname.replace(/^\//, '') || 'index.html');
    if (relative(publicRoot, file).startsWith('..')) throw new Error('outside public');
    let status = 200;
    try { assert.ok((await stat(file)).isFile()); } catch { file = resolve(publicRoot, '404.html'); status = 404; }
    response.writeHead(status, { ...headers, 'Content-Type': `${types[extname(file)] || 'application/octet-stream'}${['.html','.js','.css'].includes(extname(file)) ? '; charset=utf-8' : ''}` });
    response.end(await readFile(file));
  } catch { response.writeHead(400); response.end('Bad request'); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
const findings = [];
let assertions = 0;
const check = (value, label) => { assert.ok(value, label); assertions++; };
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 640, height: 900 }, { width: 1280, height: 900 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(url, { waitUntil: 'networkidle' });
    check(await page.title() === 'Enmanuel D. Mejia | Junior Cloud & DevOps Portfolio', 'career-specific title');
    check(await page.locator('main h1').count() === 1, 'one primary heading');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
    check(await page.locator('.portrait-wrap img').evaluate(image => image.complete && image.naturalWidth > 0), 'portrait loaded');
    check(await page.locator('.portrait-wrap img').getAttribute('fetchpriority') === 'high', 'hero loading priority');
    check(await page.locator('a[href="mailto:mejiaenmanueld@gmail.com"]').count() === 1, 'approved public contact');
    check(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior === 'auto'), 'reduced motion disables smooth scroll');
    for (const link of await page.locator('nav a').all()) {
      check((await link.boundingBox()).height >= 48, 'navigation touch target');
    }
    await page.keyboard.press('Tab');
    check(await page.locator('.skip').evaluate(element => element === document.activeElement), 'keyboard reaches skip link first');
    await page.keyboard.press('Enter');
    check(await page.locator('main').evaluate(element => element === document.activeElement), 'skip link moves keyboard focus');
    await page.locator('nav a[href="#work"]').click();
    check(new URL(page.url()).hash === '#work', 'native project fragment');
    await page.locator('nav a[href="#contact"]').click();
    check(new URL(page.url()).hash === '#contact', 'native contact fragment');
    await page.goBack();
    check(new URL(page.url()).hash === '#work', 'Back restores the previous section');
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    findings.push({ viewport, violations: accessibility.violations.map(x => ({ id: x.id, impact: x.impact, nodes: x.nodes.map(n => n.target) })) });
    check(accessibility.violations.length === 0, `automated accessibility at ${viewport.width}px`);
    check(errors.length === 0, `no runtime or policy errors: ${errors.join('; ')}`);
    await page.locator('.brand-panel img').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const image = document.querySelector('.brand-panel img');
      return image.complete && image.naturalWidth > 0;
    });
    check(await page.locator('.brand-panel img').evaluate(image => image.naturalWidth > 0), 'deferred brand image loads when reached');
    await page.screenshot({ path: resolve(output, `portfolio-${viewport.width}.png`), fullPage: true });
    await context.close();
  }
  const plainContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const plain = await plainContext.newPage();
  await plain.goto(url);
  check(await plain.locator('#contact a[href^="mailto:"]').isVisible(), 'contact works without JavaScript');
  await plain.locator('nav a[href="#work"]').click();
  check(new URL(plain.url()).hash === '#work', 'navigation works without JavaScript');
  await plain.emulateMedia({ forcedColors: 'active' });
  check(await plain.locator('h1 span').evaluate(element => getComputedStyle(element).color !== 'rgba(0, 0, 0, 0)'), 'forced-colors heading is visible');
  const missing = await plain.goto(`${url}/missing-page`);
  check(missing.status() === 404, 'real not-found response');
  await plainContext.close();
  const missingContext = await browser.newContext();
  const missingPage = await missingContext.newPage();
  await missingPage.goto(`${url}/missing-page`);
  check((await new AxeBuilder({ page: missingPage }).analyze()).violations.length === 0, 'not-found accessibility');
  await missingContext.close();
  console.log(`Portfolio browser validation passed: ${assertions} assertions, three viewport sizes, no-JavaScript and forced-colors checks. Automated checks do not replace manual screen-reader review.`);
} finally {
  await readFile(resolve(publicRoot, 'index.html'));
  await import('node:fs/promises').then(fs => fs.writeFile(resolve(output, 'accessibility.json'), JSON.stringify(findings, null, 2)));
  await browser.close();
  await new Promise(done => server.close(done));
}
