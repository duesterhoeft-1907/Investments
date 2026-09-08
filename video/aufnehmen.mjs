/**
 * Nimmt den Film in Echtzeit auf: 1920 x 1080, so lange, bis er sich selbst
 * als fertig meldet. Aufgenommen wird film-lokal.html (Schriften eingebettet,
 * siehe schriften.py); die Rohaufnahme landet in roh/.
 *
 *   node video/schriften.py && node video/aufnehmen.mjs && python3 video/schneiden.py
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const film = existsSync(join(HIER, 'film-lokal.html'))
  ? join(HIER, 'film-lokal.html')
  : join(HIER, 'film.html');

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? undefined,
  args: ['--force-device-scale-factor=1', '--hide-scrollbars'],
});
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: { dir: join(HIER, 'roh'), size: { width: 1920, height: 1080 } },
});
const page = await ctx.newPage();
await page.goto('file://' + film);
await page.waitForFunction('window.__BEREIT__ === true', null, { timeout: 30000 });
const dauer = await page.evaluate('window.__DAUER__');
console.log('Dauer laut Ablauf:', dauer, 's');

const t0 = Date.now();
await page.waitForFunction('window.__FERTIG__ === true', null, { timeout: (dauer + 60) * 1000 });
console.log('Wirklich gelaufen:', ((Date.now() - t0) / 1000).toFixed(1), 's');

await page.waitForTimeout(500);
await ctx.close();
await browser.close();
console.log('Aufnahme liegt in', join(HIER, 'roh'));
