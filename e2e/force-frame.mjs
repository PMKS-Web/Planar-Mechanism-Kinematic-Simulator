/** Compound tracer ownership and the designer’s force frame interaction. */
import { mkdirSync, readFileSync } from 'node:fs';
import { openMechanism } from './app-ready.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/force-frame';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
await page.addInitScript(() => {
  localStorage.setItem('tutorialSeen', '1');
  localStorage.setItem('whatsNewSeen', '2026.09');
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const results = [];
function check(label, ok, detail) {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ' ' + JSON.stringify(detail)}`);
}
const grid = (fn, arg) =>
  page.evaluate(
    ({ source, arg }) =>
      new Function('g', 'arg', `return (${source})(g, arg)`)(
        ng.getComponent(document.querySelector('app-new-grid')),
        arg
      ),
    { source: fn.toString(), arg }
  );
const load = (payload) => openMechanism(page, `${BASE}/?${payload}`);
const compound =
  '2v.9x,1E8.A,0.1011.0H,H,ve,0Cg,0.8I,I,11m,He,0.0J,J,1YS,01G,0..ARHIJ,HIJ,0,0,17v,5L,303e9f,H,I,J,,HI,IJ.aRHI,HI,0,0,zi,2V,303e9f,H,I,,.aRIJ,IJ,0,0,1I6,8C,0d125a,I,J,,...N_l*2yNYpD';
try {
  await load(compound);
  const target = await grid((g) => {
    const p = g.svgGrid.modelToScreen(g.mechanismSrv.links[0].subset[0].CoM);
    return { x: p.x, y: p.y };
  });
  await page.mouse.click(target.x, target.y);
  await page.mouse.click(target.x, target.y);
  check('second click selects HI', await grid((g) => g.activeObjService.selectedLink.id === 'HI'));
  await page.getByRole('button', { name: 'Add Tracer Point', exact: true }).click();
  const topology = () =>
    grid((g) => {
      const root = g.mechanismSrv.links[0];
      const tracer = g.mechanismSrv.joints.find((j) => j.id === 'K');
      return {
        root: root.joints
          .map((j) => j.id)
          .sort()
          .join(),
        leaves: root.subset.map((l) =>
          l.joints
            .map((j) => j.id)
            .sort()
            .join()
        ),
        owner: tracer?.links[0] === root,
        connections: tracer?.connectedJoints
          .map((j) => j.id)
          .sort()
          .join(),
      };
    });
  let added = await topology();
  check(
    'tracer belongs to HI and its compound, not IJ',
    added.root === 'H,I,J,K' &&
      added.leaves.includes('H,I,K') &&
      added.leaves.includes('I,J') &&
      added.owner &&
      added.connections === 'H,I,J',
    added
  );
  const k = await page.locator('#joint_K').boundingBox();
  const film = filmstrip(page, OUT);
  await film.during(80, 10, 'tracer', async () => {
    await page.mouse.move(k.x + k.width / 2, k.y + k.height / 2);
    await page.mouse.down();
    await page.mouse.move(k.x + k.width / 2 - 50, k.y + k.height / 2, { steps: 12 });
    await page.mouse.up();
  });
  check('dragging the new tracer preserves body ownership', (await topology()).owner);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  check('one undo removes the tracer addition', (await page.locator('#joint_K').count()) === 0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  added = await topology();
  check(
    'redo/URL reconstruction retains primitive and compound memberships',
    added.owner && added.root === 'H,I,J,K' && added.leaves.includes('H,I,K'),
    added
  );
  await page.screenshot({ path: `${OUT}/tracer.png` });
  // Selecting a leaf must make Delete address that leaf, not silently look
  // for it among roots. Exercise the keyboard and the panel separately.
  for (const command of ['keyboard', 'panel']) {
    await load(compound);
    const at = await grid((g) => {
      const p = g.svgGrid.modelToScreen(g.mechanismSrv.links[0].subset[0].CoM);
      return { x: p.x, y: p.y };
    });
    await page.mouse.click(at.x, at.y);
    await page.mouse.click(at.x, at.y);
    if (command === 'keyboard') await page.keyboard.press('Delete');
    else await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const remaining = await grid((g) => ({
      links: g.mechanismSrv.links.map((l) => l.id),
      joints: g.mechanismSrv.joints.map((j) => j.id),
      welded: g.mechanismSrv.joints.some((j) => j.isWelded),
    }));
    check(
      `${command} Delete removes only the selected primitive`,
      remaining.links.join() === 'IJ' && remaining.joints.join() === 'I,J' && !remaining.welded,
      remaining
    );
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    check(
      `${command} primitive deletion is one undo`,
      await grid(
        (g) => g.mechanismSrv.links[0].subset.length === 2 && g.mechanismSrv.joints.length === 3
      )
    );
  }
  await load(TEMPLATE_LINKAGES['4-Bar']);
  await grid((g) => {
    g.activeObjService.updateSelectedObj(g.mechanismSrv.links.find((l) => l.id === 'BC'));
    g.mechanismSrv.createForceAtCOM();
    g.activeObjService.updateSelectedObj(g.mechanismSrv.forces[0]);
  });
  await page.getByRole('button', { name: 'Flip Force', exact: true }).waitFor();
  const force = () =>
    grid((g) => {
      const f = g.mechanismSrv.forces[0];
      return {
        start: [f.startCoord.x, f.startCoord.y],
        end: [f.endCoord.x, f.endCoord.y],
        x: f.xComp,
        y: f.yComp,
        angle: f.angleRad,
        local: f.local,
        frame: f.link.angleRad,
      };
    });
  const before = await force();
  check('global frame uses a ring', (await page.locator('.forceFrameRing').count()) === 1);
  check(
    'selection shows datum and square direction handle',
    (await page.locator('.forceDatum').count()) === 1 &&
      (await page.locator('#endForceEndpoint rect').count()) === 1
  );
  await film.during(80, 8, 'flip', async () => {
    await page.getByRole('button', { name: 'Flip Force', exact: true }).click();
  });
  const after = await force();
  check(
    'panel flip keeps endpoints and reverses the load',
    before.start.every((v, i) => Math.abs(v - after.start[i]) < 1e-8) &&
      before.end.every((v, i) => Math.abs(v - after.end[i]) < 1e-8) &&
      Math.abs(before.x + after.x) < 1e-8 &&
      Math.abs(before.y + after.y) < 1e-8,
    { before, after }
  );
  const mark = await page.locator('.forceApplicationMark').getAttribute('transform');
  check(
    'frame mark stays at application point after flip',
    mark.startsWith(`translate(${after.start[0]} ${after.start[1]})`),
    mark
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  check('flip is one undo', Math.abs((await force()).y - before.y) < 0.005);
  // Select after reconstruction, then switch to the local frame through the actual panel.
  await grid((g) => g.activeObjService.updateSelectedObj(g.mechanismSrv.forces[0]));
  await page.locator('radio-block button').first().click();
  const angleInput = page
    .locator('app-edit-panel dual-input-block')
    .first()
    .locator('input')
    .nth(1);
  await angleInput.hover();
  await page.locator('.forceAngleGuide').waitFor();
  let local = await force();
  const displayed = Number.parseFloat(await angleInput.inputValue());
  const relative =
    (Math.atan2(Math.sin(local.angle - local.frame), Math.cos(local.angle - local.frame)) * 180) /
    Math.PI;
  check(
    'local field and hover guide measure from body frame',
    local.local &&
      Math.abs(displayed - relative) < 0.6 &&
      (await page.locator('.forceKeyway').count()) === 1,
    { displayed, relative, local }
  );
  await page.screenshot({ path: `${OUT}/local-angle.png` });
  await angleInput.fill('45 deg');
  await angleInput.press('Tab');
  local = await force();
  check(
    'typing a local angle rotates relative to the body',
    Math.abs(
      Math.atan2(Math.sin(local.angle - local.frame), Math.cos(local.angle - local.frame)) -
        Math.PI / 4
    ) < 1e-6,
    local
  );
  await page.mouse.move(1300, 800);
  await page.getByRole('button', { name: 'Flip Force', exact: true }).focus();
  check(
    'angle guide clears after hover and focus leave',
    (await page.locator('.forceAngleGuide').count()) === 0
  );
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await film.during(100, 12, 'playback', async () => {});
  check(
    'playback hides datum and handles',
    (await page.locator('.forceDatum').count()) === 0 &&
      (await page.locator('#endForceEndpoint').count()) === 0
  );
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await grid((g) => {
    g.mechanismSrv.forces[0].locked = true;
    g.activeObjService.fakeUpdateSelectedObj();
  });
  await page.mouse.move(1299, 799);
  check(
    'locked force cannot flip',
    await page.getByRole('button', { name: 'Flip Force', exact: true }).isDisabled()
  );
  await page.screenshot({ path: `${OUT}/locked.png` });
  check('no runtime errors', errors.length === 0, errors);
  await contactSheet(`${OUT}/*-tracer.png`, `${OUT}/tracer-film.png`, 4, 0.4);
  await contactSheet(`${OUT}/*-flip.png`, `${OUT}/flip-film.png`, 4, 0.4);
  await contactSheet(`${OUT}/*-playback.png`, `${OUT}/playback-film.png`, 4, 0.4);
} finally {
  await browser.close();
}
if (results.some((ok) => !ok)) process.exitCode = 1;
