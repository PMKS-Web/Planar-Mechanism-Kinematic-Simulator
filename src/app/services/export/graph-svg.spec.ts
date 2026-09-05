import { ExportPlot } from './export-table.service';
import { plotSvg } from './graph-svg';

describe('exported graph time axis', () => {
  function render(times: number[], values = times.map(() => 1)): SVGSVGElement {
    const plot: ExportPlot = {
      title: 'Position of Joint B',
      head: 'Position B',
      unit: 'cm',
      columnKey: 'position',
      partKey: 'B',
      mechanismIndex: 0,
      series: [{ name: 'X', values }],
    };
    const svg = plotSvg(plot, times, { width: 676, height: 360, standalone: true });
    return new DOMParser().parseFromString(svg, 'image/svg+xml')
      .documentElement as unknown as SVGSVGElement;
  }

  function xs(svg: SVGSVGElement): number[] {
    return svg
      .querySelector('polyline')!
      .getAttribute('points')!
      .split(' ')
      .map((point) => Number(point.split(',')[0]));
  }

  it('places adaptive samples by elapsed time, not by row number', () => {
    expect(xs(render([0, 1, 1.25, 1.5, 4]))).toEqual([62, 212, 249.5, 287, 662]);
  });

  it('uses the same time range for the curve and its endpoint labels', () => {
    const svg = render([2, 3, 6]);
    expect(xs(svg)).toEqual([62, 212, 662]);
    expect(svg.textContent).toContain('2 s');
    expect(svg.textContent).toContain('6.00 s');
  });

  it('centers a single sample without nonfinite coordinates', () => {
    const svg = render([0]);
    expect(svg.querySelector('circle')!.getAttribute('cx')).toBe('362');
    expect(svg.outerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('keeps missing results as separate runs at their actual timestamps', () => {
    const svg = render([0, 0.1, 0.2, 0.4, 1], [1, 1, NaN, 1, 1]);
    const lines = [...svg.querySelectorAll('polyline')];
    expect(lines).toHaveLength(2);
    expect(lines[1].getAttribute('points')!.split(' ')[0].split(',')[0]).toBe('302');
  });
});
