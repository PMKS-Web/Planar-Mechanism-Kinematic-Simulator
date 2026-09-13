import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { openNative, nativeState, bodyCenter, markCenter } from './native-editor.mjs';
import { BANNED } from './ui-copy-rules.mjs';
const out = 'artifacts/bodies-and-joints/S5/ui-copy-native';
await mkdir(out, { recursive: true });
const browser = await chromium.launch(),
  page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
const checked = [],
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
async function screen(name) {
  const text = await page.locator('body').innerText();
  const tips = await page
    .locator('[title], [aria-label]')
    .evaluateAll((els) =>
      els
        .map((e) => `${e.getAttribute('title') ?? ''} ${e.getAttribute('aria-label') ?? ''}`)
        .join('\n')
    );
  for (const [pattern, why] of BANNED)
    assert.ok(!pattern.test(text + '\n' + tips), `${name}: ${why}`);
  checked.push(name);
}
try {
  for (const key of ['four-bar', 'axial', 'mount-slot-floating', 'multiway']) {
    await openNative(page, key);
    const state = await nativeState(page);
    await screen(`${key} transport`);
    const body = state.document.bodies.find((b) => b.kind === 'material'),
      at = await bodyCenter(page, body.id);
    await page.keyboard.down('Alt');
    await page.mouse.click(at.x, at.y);
    await page.keyboard.up('Alt');
    await screen(`${key} member panel`);
    for (const button of await page.locator('app-native-inspector .panel-header__toggle').all()) {
      if (await button.isVisible()) await button.click();
    }
    await screen(`${key} material properties`);
    const point = await markCenter(page, state.document.joints[0].id);
    await page.mouse.click(point.x, point.y, { button: 'right' });
    await page.getByRole('menu').waitFor();
    await screen(`${key} context menu`);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Project Menu', exact: true }).click();
    await screen(`${key} project`);
  }
  assert.equal(errors.length, 0, errors.join('\n'));
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify({ checked, errors }, null, 2));
  await browser.close();
}
