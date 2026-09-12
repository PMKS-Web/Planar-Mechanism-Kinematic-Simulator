/** Measurements stay in the displayed units. No filtering or fitting is hidden in RMSE. */
export interface Measurement {
  time: number;
  value: number;
}

export interface ComparedMeasurement extends Measurement {
  theoretical: number;
  residual: number;
}

export interface MeasurementComparison {
  points: ComparedMeasurement[];
  excluded: number;
  rmse: number;
  bias: number;
  peakError: number;
}

/** Accept two numeric columns pasted from a spreadsheet, with an optional Time,Value header. */
export function parseMeasurements(text: string): Measurement[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const points: Measurement[] = [];
  let sawContent = false;
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line) continue;
    if (!sawContent && /^time(?:\s*\(s\))?[,\t ]+value$/i.test(line)) {
      sawContent = true;
      continue;
    }
    sawContent = true;
    const cells = line.includes(',') ? line.split(',') : line.split(/\s+/);
    const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
    if (cells.length !== 2 || cells.some((cell) => !numeric.test(cell.trim()))) {
      throw new Error(`Row ${index + 1}: enter two numbers, time in seconds and measured value.`);
    }
    const [time, value] = cells.map(Number);
    if (!Number.isFinite(time) || !Number.isFinite(value)) {
      throw new Error(`Row ${index + 1}: both numbers must be finite.`);
    }
    if (points.length && time <= points[points.length - 1].time) {
      throw new Error(`Row ${index + 1}: times must increase, with no duplicates.`);
    }
    points.push({ time, value });
    if (points.length > 10000) throw new Error('Compare up to 10,000 measurements at a time.');
  }
  if (!points.length) throw new Error('Enter at least one measurement.');
  return points;
}

/** Shortest angular difference, only when the quantity is an angle (never an angular rate). */
export function wrappedDifference(value: number, period = 0): number {
  return period > 0 ? ((((value + period / 2) % period) + period) % period) - period / 2 : value;
}

/** Preserve a continuous angle branch for the overlay, restarting at missing samples. */
export function unwrapMeasurements(values: number[], period: number): number[] {
  const result: number[] = [];
  values.forEach((value, i) => {
    result.push(
      i > 0 && Number.isFinite(value) && Number.isFinite(result[i - 1])
        ? result[i - 1] + wrappedDifference(value - values[i - 1], period)
        : value
    );
  });
  return result;
}

/** Linear interpolation never crosses a missing solve or extrapolates beyond the solved cycle. */
export function compareMeasurements(
  measurements: Measurement[],
  times: number[],
  values: number[],
  timeOffset = 0,
  anglePeriod = 0
): MeasurementComparison {
  if (!Number.isFinite(timeOffset)) throw new Error('Enter a finite time offset in seconds.');
  if (
    !times.length ||
    times.length !== values.length ||
    times.some((time, i) => !Number.isFinite(time) || (i > 0 && time <= times[i - 1]))
  ) {
    throw new Error('This quantity has no valid theoretical time series to compare.');
  }
  const points: ComparedMeasurement[] = [];
  for (const measurement of measurements) {
    const time = measurement.time + timeOffset;
    if (time < times[0] || time > times[times.length - 1]) continue;
    let lo = 0;
    let hi = times.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (times[mid] < time) lo = mid + 1;
      else hi = mid;
    }
    let theoretical = values[lo];
    if (times[lo] !== time) {
      if (!Number.isFinite(values[lo - 1]) || !Number.isFinite(theoretical)) continue;
      const fraction = (time - times[lo - 1]) / (times[lo] - times[lo - 1]);
      theoretical =
        values[lo - 1] + fraction * wrappedDifference(theoretical - values[lo - 1], anglePeriod);
    }
    if (!Number.isFinite(theoretical)) continue;
    const residual = wrappedDifference(measurement.value - theoretical, anglePeriod);
    if (!Number.isFinite(residual))
      throw new Error('The measured difference exceeds the numeric range.');
    points.push({ time, value: measurement.value, theoretical, residual });
  }
  if (!points.length) {
    throw new Error(
      'No measurements overlap valid theoretical samples. Check the times and offset.'
    );
  }
  // Scaling before squaring avoids overflow for finite, large measurements.
  const peakError = points.reduce((peak, point) => Math.max(peak, Math.abs(point.residual)), 0);
  const meanSquare =
    peakError === 0
      ? 0
      : points.reduce((sum, point) => sum + (point.residual / peakError) ** 2 / points.length, 0);
  return {
    points,
    excluded: measurements.length - points.length,
    rmse: peakError * Math.sqrt(meanSquare),
    bias: points.reduce((sum, point) => sum + point.residual / points.length, 0),
    peakError,
  };
}
