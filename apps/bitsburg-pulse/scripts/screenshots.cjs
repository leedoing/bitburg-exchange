// Usage: node scripts/screenshots.cjs [baseUrl] [outDir] [range]
// Needs `npm run dev` running. Playwright is borrowed from tools/traffic-gen.
const path = require('node:path');
const fs = require('node:fs');

const repo = path.resolve(__dirname, '../../..');
const { chromium } = require(require.resolve('playwright', { paths: [path.join(repo, 'tools/traffic-gen')] }));

const base = process.argv[2] || 'http://localhost:5173/';
const out = path.resolve(process.argv[3] || path.join(repo, 'docs/screenshots'));
const range = process.argv[4] || '1h';
const tabs = ['situation', 'ops', 'pm', 'campaign', 'exec', 'control'];

(async () => {
    fs.mkdirSync(out, { recursive: true });
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
    for (const tab of tabs) {
        await page.goto(`${base}#/${tab}?range=${range}`);
        await page.waitForSelector('.content > *', { timeout: 30_000 });
        await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 120_000 });
        await page.waitForTimeout(1500);
        const file = path.join(out, `pulse-${tab}-${range}.png`);
        await page.screenshot({ path: file, fullPage: true });
        const errBox = await page.$$eval('.error-box', (els) => els.map((e) => e.textContent));
        console.log(`${tab}: ${path.relative(repo, file)}${errBox.length ? ` ERROR ${errBox.join(' | ')}` : ''}`);
    }
    await browser.close();
    if (errors.length) console.log(errors.slice(0, 20).join('\n'));
})();
