import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { openMechanism } from './app-ready.mjs';

const out = 'artifacts/force-diagram-equations';
mkdirSync(out, { recursive: true });
const gallery = readFileSync('docs/fixture-urls.md', 'utf8');
const payload = (name) =>
  gallery
    .split('\n')
    .find((line) => line.startsWith('| [' + name + ']'))
    .match(/\?([^)]*)\)/)[1];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

try {
  await openMechanism(
    page,
    (process.env.PMKS_BASE_URL || 'http://localhost:4200/') + '?' + payload('TeachingLab four-bar')
  );
  await page.getByRole('button', { name: /Force Analysis/ }).click();
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  const worksheet = page.locator('app-right-panel app-solver-explanation').first();
  await worksheet.waitFor();
  assert.equal(await worksheet.locator('details[open]').count(), 0);
  assert.equal(await worksheet.getByRole('button', { name: 'Open Full Worksheet' }).count(), 0);

  await worksheet.getByRole('button', { name: 'Definitions', exact: true }).click();
  const definitions = worksheet.locator('app-force-definitions');
  await definitions.locator('.definitionStep').nth(1).locator(':scope > summary').click();
  const definitionMath = await definitions
    .locator('annotation[encoding="application/x-tex"]')
    .allTextContents();
  assert(definitionMath.some((equation) => equation.includes('-(r_{P/O,x}F_z-r_{P/O,z}F_x)')));
  assert(definitionMath.every((equation) => !equation.includes('\\langle')));
  assert.equal(await definitions.locator('.katex-error').count(), 0);
  const diagramFits = await definitions
    .locator('.definitionStep')
    .nth(1)
    .locator('app-solver-diagram')
    .first()
    .evaluate((element) => {
      const svg = element.querySelector('svg');
      return element.scrollHeight <= element.clientHeight && svg.scrollHeight <= svg.clientHeight;
    });
  assert(diagramFits, 'The slanted-link diagram must not create an inner scroll area.');
  await definitions
    .locator('.definitionStep')
    .nth(1)
    .locator('app-solver-diagram')
    .first()
    .screenshot({ path: out + '/slanted-link.png' });

  await worksheet.getByRole('button', { name: 'Free Bodies', exact: true }).click();
  assert.equal(await worksheet.getByText('Assemble All Bodies into One System').count(), 0);
  assert.equal(await worksheet.getByText('Reset Worksheet Conventions').count(), 0);
  assert.equal(await worksheet.getByText('Assemble & Solve').count(), 0);
  const body = worksheet.locator('.bodyCard').first();
  assert.equal(await worksheet.locator('details[open]').count(), 0);
  assert.equal(await body.locator('.bodyStep').count(), 4);
  assert.deepEqual(await body.locator('.bodyStep > summary').allTextContents(), [
    '1 · Build the Free-Body Diagram',
    '2 · Variables in This Example',
    '3 · Vector Equations',
    '4 · Build the Sum of Forces and Sum of Moments',
  ]);
  assert.equal(await worksheet.getByText('Solved Directions', { exact: true }).count(), 0);

  await body.locator(':scope > summary').click();
  await body.locator('.bodyStep').nth(0).locator(':scope > summary').click();
  assert(await body.locator('app-force-balance').first().isVisible());
  assert.equal(
    await body.getByText('Choose Free-Body Diagram Conventions', { exact: true }).count(),
    1
  );
  assert.equal(
    await body.getByText('Show the Position-Vector Projection Grid', { exact: true }).count(),
    1
  );
  assert.equal(await body.getByText(/Isolate/).count(), 1);
  assert.equal(await body.locator('.bodyAdjustments app-worksheet-choices').count(), 0);
  await body.locator('.projectionGrid > summary').click();
  assert.equal(await body.locator('.projectionGrid app-solver-diagram').count(), 1);

  await body.locator('.bodyStep').nth(1).locator(':scope > summary').click();
  assert((await body.locator('.bodyStep').nth(1).locator('tbody tr').count()) > 2);

  await body.locator('.bodyStep').nth(2).locator(':scope > summary').click();
  assert.equal(await body.getByText('Force vectors', { exact: true }).count(), 1);
  assert.equal(await body.getByText(/Position vectors about/).count(), 1);

  await body.locator('.bodyStep').nth(3).locator(':scope > summary').click();
  assert.equal(await body.getByText('Sum of Forces', { exact: true }).count(), 1);
  await body.getByText('Sum of Forces', { exact: true }).click();
  assert.equal(await body.getByText('Sum of Forces in x', { exact: true }).count(), 1);
  assert.equal(await body.getByText('Sum of Forces in y', { exact: true }).count(), 1);
  assert.equal(await body.getByText('Sum of Moments in z', { exact: true }).count(), 1);
  assert.equal(await body.getByText('Show Moment-Arm Calculations', { exact: true }).count(), 0);
  await body.getByText('Sum of Forces in x', { exact: true }).click();
  assert.equal(
    await body
      .getByText('Sum of Forces in x', { exact: true })
      .locator('..')
      .locator('app-solver-math')
      .count(),
    2
  );
  const xDiagram = body
    .getByText('Sum of Forces in x', { exact: true })
    .locator('..')
    .locator('app-force-balance');
  const highlighted = await xDiagram.locator('app-solver-diagram').evaluate((element) =>
    window.ng
      .getComponent(element)
      .diagram()
      .lines.filter((line) => line.balanceAxes)
      .map((line) => ({ axes: line.balanceAxes, color: line.color }))
  );
  assert(highlighted.some((line) => line.color === 'var(--warning)'));

  await worksheet.getByRole('button', { name: 'System', exact: true }).click();
  assert.equal(await worksheet.locator('app-solver-matrix').count(), 1);
  const knownValues = worksheet.locator('.systemKnownValues');
  assert.equal(await knownValues.getAttribute('open'), null);
  await knownValues.locator(':scope > summary').click();
  const knownBody = knownValues.locator('.knownValuesBody').first();
  assert.equal(await knownBody.getAttribute('open'), null);
  await knownBody.locator(':scope > summary').click();
  assert((await knownBody.locator('tbody tr').count()) > 0);
  assert.deepEqual(await knownBody.locator('thead th').allTextContents(), ['Variable', 'Value']);
  assert(
    (await knownValues.locator('annotation[encoding="application/x-tex"]').allTextContents()).some(
      (equation) => equation.startsWith('r_{')
    )
  );
  await knownValues.screenshot({ path: out + '/system-known-values.png' });
  await knownBody.locator(':scope > summary').click();
  await knownValues.locator(':scope > summary').click();
  const assembly = worksheet.locator('.systemAssembly');
  assert.equal(await assembly.getAttribute('open'), null);
  const matrix = worksheet.locator('app-solver-matrix');
  assert.equal(await worksheet.locator('details[open]').count(), 0);
  await assembly.locator(':scope > summary').click();
  const equationCount = await assembly.locator('.numberedEquation').count();
  assert(equationCount > 0);
  await assembly.getByRole('combobox', { name: 'System equation display' }).selectOption('both');
  assert.equal(await assembly.locator('.numberedEquation').count(), equationCount * 2);
  assert.equal(
    await assembly.locator('.numberedEquation[data-display="values"]').count(),
    equationCount
  );
  await assembly.getByRole('combobox', { name: 'System equation display' }).selectOption('values');
  assert.equal(await assembly.locator('.numberedEquation').count(), equationCount);

  await matrix.locator(':scope > details > summary').click();
  await matrix.getByRole('combobox', { name: 'Force matrix display' }).selectOption('coefficients');
  assert.equal(
    await matrix.locator('.matrixScroll[data-matrix-display="coefficients"]').count(),
    1
  );
  const coefficientMath = await matrix
    .locator('annotation[encoding="application/x-tex"]')
    .allTextContents();
  assert(coefficientMath.some((equation) => equation.includes('r_{')));
  const knownMath = await matrix
    .locator(
      '.matrixScroll[data-matrix-display="coefficients"] .knownVector annotation[encoding="application/x-tex"]'
    )
    .allTextContents();
  assert(knownMath.some((equation) => equation.includes('W_{')));
  await matrix.getByRole('combobox', { name: 'Force matrix display' }).selectOption('both');
  assert.equal(await matrix.locator('.matrixScroll').count(), 2);
  assert.equal(await matrix.locator('.matrixScroll[data-matrix-display="values"]').count(), 1);
  await matrix.screenshot({ path: out + '/system-matrix-both.png' });
  assert(
    (await matrix.locator('annotation[encoding="application/x-tex"]').allTextContents()).some(
      (equation) => equation === 'X=A^{-1}B'
    ) || (await matrix.getByText('A has no ordinary inverse', { exact: false }).count()) === 1
  );
  assert.equal(await worksheet.locator('.katex-error').count(), 0);
  await worksheet.getByRole('button', { name: 'Free Bodies', exact: true }).click();
  assert.equal(await worksheet.locator('details[open]').count(), 0);
  await worksheet.locator('.overviewDetails > summary').click();
  await worksheet.getByRole('button', { name: 'System', exact: true }).click();
  assert.equal(await worksheet.locator('details[open]').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: Free Bodies follows the FBD, variables, and equation teaching sequence.');
} finally {
  writeFileSync(out + '/report.json', JSON.stringify({ errors }, null, 2));
  await browser.close();
}
