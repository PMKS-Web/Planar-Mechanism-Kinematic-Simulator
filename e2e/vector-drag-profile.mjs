/** Profile vector work during an analysis drag, keeping a repeatable comparison. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
import { launch, loadScenario, dragTarget, plainDrag } from './drag-perf-harness.mjs';
const { browser, page } = await launch();
const scenario = { template: '4-Bar', mode: 'Kinematic', drag: { joint: 'B' } };
try {
  await loadScenario(page, scenario);
  await page.evaluate(() => {
    const g = ng.getComponent(document.querySelector('app-new-grid'));
    const m = g.mechanismSrv;
    for (const id of ['B', 'C'])
      for (const q of ['velocity', 'acceleration']) {
        m.toggleVectorTrace(
          m.joints.find((j) => j.id === id),
          q
        );
      }
    window.vectorProfile = {};
    for (const [object, names] of [
      [m, ['updateMechanism', 'buildVectorTraces', 'liveVectorArrows']],
      [m.samples, ['sampleAt']],
    ]) {
      for (const name of names) {
        const original = object[name];
        if (typeof original !== 'function') continue;
        object[name] = function (...args) {
          const start = performance.now();
          try {
            return original.apply(this, args);
          } finally {
            const entry = (window.vectorProfile[name] ??= { calls: 0, ms: 0 });
            entry.calls++;
            entry.ms += performance.now() - start;
          }
        };
      }
    }
  });
  const target = await dragTarget(page, scenario);
  if (process.env.PMKS_VECTOR_FILM) {
    const film = filmstrip(page, 'artifacts/vector-drag-profile/film');
    await film.shot('before');
    await film.during(40, 12, 'drag', () => plainDrag(page, target, 1));
    await film.shot('released');
    await contactSheet(
      'artifacts/vector-drag-profile/film/*.png',
      'artifacts/vector-drag-profile/film.png',
      4,
      0.35
    );
  } else await plainDrag(page, target, 1);
  await page.evaluate(() => (window.vectorProfile = {}));
  const drag = await plainDrag(page, await dragTarget(page, scenario), -1);
  const profile = await page.evaluate(() => window.vectorProfile);
  console.log(JSON.stringify({ drag, profile }, null, 2));
  mkdirSync('artifacts/vector-drag-profile', { recursive: true });
  writeFileSync(
    'artifacts/vector-drag-profile/report.json',
    JSON.stringify({ drag, profile }, null, 2)
  );
} finally {
  await browser.close();
}
