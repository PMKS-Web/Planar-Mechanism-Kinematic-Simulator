/**
 * The app with reduced motion on.
 *
 * `src/styles.scss` cuts every transition and animation to almost nothing
 * under `prefers-reduced-motion: reduce`, in one rule, so that no component
 * has to remember to. The risk in a rule that broad is something waiting on an
 * animation that no longer runs: a splash that never leaves, a sheet that
 * never opens. This opens the app with the preference on and checks that
 * everything still gets where it was going.
 *
 *   PMKS_BASE_URL=http://localhost:4200 node e2e/reduced-motion.mjs
 */

const playwright = process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright';
const { chromium, devices } = await import(playwright + '/node_modules/playwright/index.mjs');
import { waitForReady } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? process.env.PMKS_URL ?? 'http://localhost:4200';

const results = [];
const record = (name, ok, detail) => {
  results.push([name, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const browser = await chromium.launch();
const errors = [];

/** A context with the preference on, quiet on arrival, and a page collecting its errors. */
async function open(options) {
  const context = await browser.newContext({ ...options, reducedMotion: 'reduce' });
  await startQuiet(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  return { context, page };
}

// A desktop window, with a mechanism in the URL so the whole boot path runs.
{
  const { context, page } = await open({ viewport: { width: 1280, height: 800 } });
  record(
    'the page sees the preference',
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
  record('the boot splash has left', (await page.locator('#bootSplash').count()) === 0);
  // A transition declared at one second comes out at almost nothing: the one
  // global rule reaches an element no stylesheet has ever named.
  const seconds = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.transition = 'opacity 1s';
    document.body.appendChild(probe);
    const duration = getComputedStyle(probe).transitionDuration;
    probe.remove();
    return duration.endsWith('ms') ? parseFloat(duration) / 1000 : parseFloat(duration);
  });
  record('every transition is cut to almost nothing', seconds < 0.001, { seconds });
  await context.close();
}

// A phone, where the mode panel is a sheet that animates open by script.
{
  const { context, page } = await open({ ...devices['iPhone 13'] });
  const box = () => page.locator('.panel').boundingBox();
  const shut = await box();
  await page.locator('.sheetHandle').click();
  await page.waitForTimeout(400);
  const opened = await box();
  record('the phone sheet still opens by its handle', opened.height > shut.height + 100, {
    shut,
    opened,
  });
  await page.locator('.sheetHandle').click();
  await page.waitForTimeout(400);
  const shutAgain = await box();
  record('and shuts again', Math.abs(shutAgain.height - shut.height) <= 2, { shut, shutAgain });
  await context.close();
}

record('no page errors', errors.length === 0, errors);
await browser.close();

const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
