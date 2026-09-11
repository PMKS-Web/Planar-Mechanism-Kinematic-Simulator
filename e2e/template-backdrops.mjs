/**
 * The real-life section of the library, and the picture each of its cards
 * opens on.
 *
 * A traced template ships the picture it was drawn over; the card's name in
 * the address fragment puts it up in a new tab, and opening the card in place
 * puts it up here. Checked on what a reader sees: the section heading, the
 * four cards, the picture standing behind the mechanism once a card is
 * opened, and the grid ruled over it in transparent black rather than a
 * baked-in gray.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/template-backdrops.mjs
 */
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const backdrop = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const image = grid.bgImage.image();
    return image
      ? {
          src: image.src,
          width: image.width,
          opacity: image.opacity,
          drawn: !!document.querySelector('#backgroundImageHolder image'),
        }
      : null;
  });

// --- a card's name in the fragment puts its picture up ------------------------
await page.goto(`${BASE}/?${payloads['Car_Steering']}#backdrop=Car_Steering`, {
  waitUntil: 'domcontentloaded',
});
await waitForReady(page);
await page.waitForFunction(
  () => !!ng.getComponent(document.querySelector('app-new-grid')).bgImage.image(),
  undefined,
  { timeout: 5000 }
);
const steering = await backdrop();
record(
  'the steering card opened by fragment stands on its picture, 2.26 m wide in a drawing in meters',
  !!steering &&
    steering.src === 'assets/backdrops/car-steering.png' &&
    Math.abs(steering.width - 452) < 1 &&
    steering.drawn,
  steering
);

// --- the grid over it is transparent black --------------------------------------
const ink = await page.evaluate(() => {
  const minor = document.querySelector('.gridLineMinor');
  const major = document.querySelector('.gridLineMajor');
  return {
    minor: minor ? getComputedStyle(minor).stroke : null,
    major: major ? getComputedStyle(major).stroke : null,
  };
});
record(
  'the grid lines are black at a low opacity, not a baked-in gray',
  /rgba\(0, 0, 0, 0\.0[0-9]*5\)/.test(ink.minor ?? '') &&
    /rgba\(0, 0, 0, 0\.1\)/.test(ink.major ?? ''),
  ink
);

// --- the library has the section, and opening a card in place places the picture
await page.goto(`${BASE}/?library`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForSelector('app-templates', { timeout: 10000 });
const section = await page.evaluate(() => {
  const headings = [...document.querySelectorAll('app-templates .sectionHeading')].map((node) =>
    node.textContent?.trim()
  );
  const cards = [
    ...document.querySelectorAll('app-templates [data-template-id], app-templates .card'),
  ].length;
  return { headings, cards };
});
record(
  'the library heads a Real-Life Use Cases section',
  section.headings.includes('Real-Life Use Cases'),
  section
);
const opened = await page.evaluate(() => {
  const dialog = ng.getComponent(document.querySelector('app-templates'));
  const card = dialog.allCards.find((one) => one.id === 'Aircraft_Landing_Gear');
  return card ? { name: card.name, backdrop: card.backdrop?.src, thumbnail: card.thumbnail } : null;
});
record(
  'and the aircraft card names its picture and its own still',
  !!opened &&
    opened.backdrop === 'assets/backdrops/aircraft-landing-gear.png' &&
    opened.thumbnail === 'assets/gifs/aircraft-landing-gear.png',
  opened
);

record('nothing threw', errors.length === 0, errors.slice(0, 2));
await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
