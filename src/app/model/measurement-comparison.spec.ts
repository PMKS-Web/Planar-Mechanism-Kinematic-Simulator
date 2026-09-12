import { compareMeasurements, parseMeasurements } from './measurement-comparison';

describe('measured data comparison', () => {
  it('accepts spreadsheet and CSV rows with scientific notation and a header', () => {
    expect(parseMeasurements('\uFEFFTime (s),Value\r\n0,1e-3\r\n.5,2')).toEqual([
      { time: 0, value: 0.001 },
      { time: 0.5, value: 2 },
    ]);
    expect(parseMeasurements('0\t1\n1\t2').length).toBe(2);
  });
  it('reports malformed, missing, nonfinite and unordered data instead of dropping it', () => {
    for (const text of [
      '',
      '0,',
      '0,NaN',
      '0,Infinity',
      '0,1e999',
      '0,1,2',
      '0,2\n0,3',
      '2,1\n1,2',
    ]) {
      expect(() => parseMeasurements(text), text).toThrow();
    }
  });
  it('interpolates to measured times and reports RMSE, signed bias and peak error', () => {
    const result = compareMeasurements(parseMeasurements('0.5,3\n1.5,1'), [0, 1, 2], [0, 2, 4]);
    expect(result.rmse).toBe(2);
    expect(result.bias).toBe(0);
    expect(result.peakError).toBe(2);
    expect(result.points.map((point) => point.theoretical)).toEqual([1, 3]);
  });
  it('counts out-of-range samples and gaps without extrapolating or removing outliers', () => {
    const result = compareMeasurements(
      parseMeasurements('-1,1\n0,100\n0.5,2\n1,1\n2,4\n3,4'),
      [0, 1, 2],
      [0, NaN, 4]
    );
    expect(result.excluded).toBe(4);
    expect(result.points.length).toBe(2);
    expect(result.rmse).toBeCloseTo(Math.sqrt(5000), 10);
  });
  it('applies the explicit offset as measured time plus offset', () => {
    expect(compareMeasurements(parseMeasurements('10,2'), [0, 1], [2, 3], -10).rmse).toBe(0);
  });
  it('interpolates angles across the wrap and uses the shortest residual', () => {
    expect(compareMeasurements(parseMeasurements('0.5,0'), [0, 1], [359, 1], 0, 360).rmse).toBe(0);
    expect(compareMeasurements(parseMeasurements('0,1'), [0], [359], 0, 360).rmse).toBe(2);
    expect(compareMeasurements(parseMeasurements('0,1'), [0], [359]).rmse).toBe(358);
  });
  it('refuses a missing overlap or invalid theoretical clock', () => {
    expect(() => compareMeasurements(parseMeasurements('5,2'), [0, 1], [2, 3])).toThrow();
    expect(() => compareMeasurements(parseMeasurements('0,2'), [0, 0], [2, 3])).toThrow();
  });
});
