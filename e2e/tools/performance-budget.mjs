/** Timing noise warns; an order-of-magnitude slowdown still fails the check. */
export function performanceBudget(label, measured, expected, warningAt = expected) {
  if (!Number.isFinite(measured) || !(expected > 0)) return false;
  const severe = measured >= expected * 10;
  if (measured > warningAt) {
    console.warn(
      `${severe ? 'FAIL' : 'WARN'} ${label}: ${measured.toFixed(1)}ms (expected ${expected.toFixed(1)}ms; failure at ${(expected * 10).toFixed(1)}ms)`
    );
  }
  return !severe;
}
