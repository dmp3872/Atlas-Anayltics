/**
 * Print a portal COA page to PDF (same layout as Save / Print PDF).
 * Usage: node scripts/print-coa-pdf.mjs [slug] [outPath]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer';

const slug = process.argv[2] || 'a14d4bac128b477f56737293';
const outPath = resolve(process.argv[3] || `tmp/valor-${slug.slice(0, 8)}-coa.pdf`);
const url = `http://localhost:5173/coa/${encodeURIComponent(slug)}?print=1`;

mkdirSync(dirname(outPath), { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});

try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    // Prevent the page's auto print dialog from interfering with headless PDF capture.
    window.print = () => {};
  });
  await page.setViewport({ width: 1100, height: 1600, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(
    () => {
      const t = document.body?.innerText || '';
      return t.includes('CERTIFICATE') || t.includes('Certificate of Analysis') || t.includes('COA Not Found');
    },
    { timeout: 30000 },
  );

  // Strip site chrome before capture (defense in depth beyond print CSS).
  await page.evaluate(() => {
    document.querySelectorAll('.no-print, header, footer, nav').forEach((el) => el.remove());
  });

  await page.waitForFunction(
    () => {
      const root = document.querySelector('.coa-print-root');
      if (!root) return false;
      const imgs = [...root.querySelectorAll('img')];
      return imgs.length > 0 && imgs.every((img) => img.complete);
    },
    { timeout: 20000 },
  ).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));

  const notFound = await page.evaluate(() => (document.body?.innerText || '').includes('COA Not Found'));
  if (notFound) {
    throw new Error(`COA not found at ${url}`);
  }

  await page.emulateMediaType('print');
  await page.pdf({
    path: outPath,
    format: 'Letter',
    printBackground: true,
    preferCSSPageSize: true,
    scale: 1,
    margin: { top: '0.18in', right: '0.18in', bottom: '0.18in', left: '0.18in' },
  });
  console.log('Wrote', outPath);
} finally {
  await browser.close();
}
