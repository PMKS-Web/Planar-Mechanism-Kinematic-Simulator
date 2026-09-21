/** The shared dual-button block across its gallery states. */
import { mkdirSync } from 'node:fs';
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);

const BASE = process.env.PMKS_STORYBOOK_URL ?? 'http://localhost:4391';
const OUT = 'artifacts/dual-button';
const stories = [
  ['pair', 0],
  ['first-disabled', 1],
  ['second-disabled', 1],
  ['refused-pair', 2],
  ['stable-changing-label', 0],
  ['single', 0],
  ['long-labels', 0],
];
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 220 } });
const checks = [];
const check = (label, ok, detail) => {
  checks.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
};

for (const [story, disabled] of stories) {
  await page.goto(`${BASE}/iframe.html?id=actions-dual-button--${story}&viewMode=story`);
  await page.getByRole('button').first().waitFor();
  const buttons = page.getByRole('button');
  const count = await buttons.count();
  const boxes = [];
  for (let index = 0; index < count; index++) boxes.push(await buttons.nth(index).boundingBox());
  const disabledCount = await page.locator('button:disabled').count();
  check(`${story} has the expected disabled state`, disabledCount === disabled, disabledCount);
  check(
    `${story} fits its panel without clipping`,
    boxes.every((box) => box && box.x >= 0 && box.x + box.width <= 420),
    boxes
  );
  if (story === 'long-labels') {
    check('long labels keep label-proportional widths', boxes[1].width > boxes[0].width, boxes);
  }
  if (story === 'single') {
    const row = await page.locator('.dual-button').boundingBox();
    check('single fills the row', Math.abs(boxes[0].width - row.width) < 1, {
      button: boxes[0],
      row,
    });
  }
  if (story === 'refused-pair') {
    check(
      'both refused actions keep stable accessible names and descriptions',
      (await buttons.nth(0).getAttribute('aria-label')) === 'Add Input' &&
        (await buttons.nth(1).getAttribute('aria-label')) === 'Split Joint' &&
        !!(await buttons.nth(0).getAttribute('aria-description')) &&
        !!(await buttons.nth(1).getAttribute('aria-description')),
      await buttons.allTextContents()
    );
  }
  await page.screenshot({ path: `${OUT}/${story}.png` });
}

await browser.close();
console.log(`\n${checks.filter(Boolean).length}/${checks.length} checks passed`);
if (checks.some((ok) => !ok)) process.exitCode = 1;
