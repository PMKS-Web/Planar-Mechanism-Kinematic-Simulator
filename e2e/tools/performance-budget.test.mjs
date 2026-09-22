import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performanceBudget } from './performance-budget.mjs';

test('timing noise warns; only an extreme regression fails', () => {
  const warnings = [];
  const original = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    assert.equal(performanceBudget('drag', 105, 100), true);
    assert.match(warnings[0], /^WARN /);
    assert.equal(performanceBudget('drag', 999, 100), true);
    assert.equal(performanceBudget('drag', 1000, 100), false);
    assert.match(warnings.at(-1), /^FAIL /);
    assert.equal(performanceBudget('drag', NaN, 100), false);
  } finally {
    console.warn = original;
  }
});
