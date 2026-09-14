import { LegacyGridDocumentService } from './legacy-grid-document.service';
import { Coord } from '../../model/coord';

describe('full-motion framing', () => {
  it('bounds every solved frame and converts the drawing to viewport coordinates', () => {
    const service = Object.create(LegacyGridDocumentService.prototype) as LegacyGridDocumentService;
    const mechanism = {
      mechanisms: [
        {
          isMechanismValid: () => true,
          joints: [
            [new Coord(-4, -2), new Coord(3, 5)],
            [new Coord(-7, 4), new Coord(9, -6)],
          ],
        },
      ],
    };
    Object.assign(service, {
      mechanism,
    });

    Object.defineProperty(service, 'objectScale', { value: 2 });
    const box = (
      service as unknown as {
        fullMotionBox(): { x: number; y: number; width: number; height: number } | null;
      }
    ).fullMotionBox()!;

    // 1.3 units of padding around x [-7, 9] and viewport y [-5, 6].
    expect(box.x).toBeCloseTo(-8.3);
    expect(box.y).toBeCloseTo(-6.3);
    expect(box.width).toBeCloseTo(18.6);
    expect(box.height).toBeCloseTo(13.6);
  });
});
