// Usage: node scripts/toggle-fault.cjs <on|off> [faultLabel] [baseUrl]
// Drives the 시나리오 컨트롤 tab through the confirm modal, like a presenter would.
const path = require('node:path');

const repo = path.resolve(__dirname, '../../..');
const { chromium } = require(require.resolve('playwright', { paths: [path.join(repo, 'tools/traffic-gen')] }));

const mode = process.argv[2] === 'off' ? 'off' : 'on';
const label = process.argv[3] || 'KYC 벤더 지연 (3.5.0)';
const base = process.argv[4] || 'http://localhost:5173/';

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${base}#/control`);
    const card = page.locator('.switch', { hasText: label });
    await card.waitFor({ timeout: 60_000 });
    if (process.env.DURATION_MIN) await page.locator('.controls-opts input[type=range]').nth(1).fill(process.env.DURATION_MIN);
    await card.getByRole('button', { name: mode === 'on' ? '켜기' : '끄기' }).click();
    await page.getByRole('button', { name: mode === 'on' ? '장애 켜기' : '장애 끄기' }).click();
    await page.waitForFunction(
        ([l, m]) => {
            const el = [...document.querySelectorAll('.switch')].find((s) => s.textContent.includes(l));
            return el && (m === 'on' ? el.classList.contains('switch-on') : !el.classList.contains('switch-on'));
        },
        [label, mode],
        { timeout: 60_000 },
    );
    console.log(`${label}: ${mode} -> ${(await card.locator('.switch-state').textContent()).trim()}`);
    await browser.close();
})();
