import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { openMechanism } from './app-ready.mjs';

const out = 'artifacts/force-projection-grid';
mkdirSync(out, { recursive: true });
const payload =
  '2v.Fe,1E8.A,0.1011.6A,A,0mv,0VU,0.0B,B,0e_,E6,0.0C,C,l1,WW,0.4D,D,qD,0Pk,0..' +
  'MRAB,AB,2SG,7,0ix,08i,303e9f,A,B,,.MRBC,BC,3gO,f,32,NJ,26A69A,B,C,,.' +
  'MRCD,CD,4uW,N,nd,3P,0d125a,C,D,,..2F1,BC,F1,0K0,IV,0d7,pc,Fe..N_M*1vUzja';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

try {
  await openMechanism(page, `${process.env.PMKS_BASE_URL || 'http://localhost:4318/'}?${payload}`);
  await page.getByRole('button', { name: /Force Analysis/ }).click();
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  const worksheet = page.locator('#rightPanel app-solver-explanation');
  await worksheet.getByRole('button', { name: 'Free Bodies', exact: true }).click();

  const bodies = await worksheet.evaluate((host) =>
    window.ng.getComponent(host).view.bodies.map((body) => ({
      id: body.id,
      linkLines: body.projectionGrid.lines.filter((line) => !line.arrow && line.width >= 3).length,
      forceVector: body.forceVector,
      momentVector: body.momentVector,
      momentDefinitions: body.momentDefinitions,
    }))
  );
  assert(bodies.length >= 3);
  for (const body of bodies) {
    assert(body.linkLines > 0, `Projection grid must show the isolated ${body.id} link.`);
    assert(body.forceVector.startsWith('\\sum\\vec F='));
    assert(body.momentVector.startsWith('\\sum\\vec M_'));
    body.momentDefinitions.forEach((equation) => {
      assert(equation.includes('\\begin{bmatrix}0\\\\0\\\\'));
      assert(equation.includes(',z}'));
    });
  }
  assert(
    bodies
      .flatMap((body) => body.momentDefinitions)
      .some((equation) => equation.includes('M_{\\mathrm{in},z}'))
  );

  const first = worksheet.locator('.bodyCard').first();
  await first.locator(':scope > summary').click();
  await first.locator('.bodyStep').first().locator(':scope > summary').click();
  await first.locator('.projectionGrid > summary').click();
  const grid = first.locator('.projectionGrid app-solver-diagram');
  assert((await grid.locator('line[stroke-width="5"]').count()) > 0);
  await grid.screenshot({ path: `${out}/first-link.png` });
  await worksheet.getByRole('button', { name: 'System', exact: true }).click();
  const knownValues = worksheet.locator('.systemKnownValues');
  await knownValues.locator(':scope > summary').click();
  const knownBody = knownValues.locator('.knownValuesBody').first();
  assert.equal(await knownBody.getAttribute('open'), null);
  await knownBody.locator(':scope > summary').click();
  const knownSymbols = await knownValues
    .locator('tbody td:first-child annotation[encoding="application/x-tex"]')
    .allTextContents();
  assert(knownSymbols.some((symbol) => symbol.startsWith('r_{')));
  assert(knownSymbols.some((symbol) => symbol.includes('F_{P')));
  assert.equal(await knownValues.locator('.katex-error').count(), 0);
  await knownBody.locator(':scope > summary').click();
  await knownValues.locator(':scope > summary').click();
  const assembly = worksheet.locator('.systemAssembly');
  await assembly.locator(':scope > summary').click();
  await assembly.getByRole('combobox', { name: 'System equation display' }).selectOption('both');
  await assembly.locator('.numberedEquation').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/system-equations-both.png` });
  const matrix = worksheet.locator('app-solver-matrix');
  await matrix.locator(':scope > details > summary').click();
  await matrix.getByRole('combobox', { name: 'Force matrix display' }).selectOption('both');
  assert.equal(await matrix.locator('.matrixScroll').count(), 2);
  assert((await assembly.locator('.numberedEquation[data-display="values"]').count()) > 0);
  assert.equal(await worksheet.locator('.katex-error').count(), 0);
  console.log('PASS: The supplied mechanism renders link grids and both System display modes.');
} finally {
  await browser.close();
}
