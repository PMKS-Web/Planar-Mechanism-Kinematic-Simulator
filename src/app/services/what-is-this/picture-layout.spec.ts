import { CAPTURE, motionOutline, sheetLayout, tileFrame, tileLabels } from './picture-layout';
import { isIdOnlyTag, restingClass } from './picture-svg';

describe('the picture’s layout, as the evaluated prototype drew it', () => {
  it('fills the capture window less its margin on the tighter axis', () => {
    const frame = tileFrame({ x0: 0, y0: 0, x1: 436, y1: 100 });
    expect(frame.scale).toBeCloseTo((CAPTURE.width - 2 * CAPTURE.pad) / 436);
    expect(frame.width).toBe(CAPTURE.width);
    expect(frame.viewBox.x).toBeLessThan(0);
  });

  it('lays out six tiles three wide, and four two wide', () => {
    const tile = { width: 960, height: 500 };
    const six = sheetLayout(Array(6).fill(tile));
    expect(six.columns).toBe(3);
    expect(six.width).toBe(3 * 520 + 4 * 10);
    expect(six.fontSize).toBe(17);
    expect(sheetLayout(Array(4).fill(tile)).columns).toBe(2);
  });

  it('numbers the tiles and says what tile 0 is when there is a background image', () => {
    const moments = [{ label: '0.00 s' }, { label: '0.50 s' }];
    expect(tileLabels(moments, false)).toEqual(['1   0.00 s', '2   0.50 s']);
    expect(tileLabels(moments, true)[0]).toBe(
      '0   background image; dashed box = area of tiles 1-2'
    );
  });

  it('draws the dashed box in tile 0’s own pixels', () => {
    const overview = tileFrame({ x0: 0, y0: 0, x1: 2000, y1: 1000 });
    const motion = tileFrame({ x0: 100, y0: 100, x1: 300, y1: 200 });
    const outline = motionOutline(motion, overview);
    expect(outline.stroke * overview.scale).toBeCloseTo(3);
    expect(outline.x).toBeLessThan(motion.viewBox.x);
  });
});

describe('the picture’s SVG', () => {
  it('drops a link tag that only repeats joint letters, and keeps a name', () => {
    expect(isIdOnlyTag('ABHKLMNOPQ')).toBe(true);
    expect(isIdOnlyTag('A1B')).toBe(true);
    expect(isIdOnlyTag('Hood')).toBe(false);
  });

  it('draws a picked or pointed-at part at rest', () => {
    expect(restingClass('link link-selected')).toBe('link link-default');
    expect(restingClass('joint joint-pointed')).toBe('joint joint-default');
    expect(restingClass('joint joint-default')).toBeUndefined();
  });
});
