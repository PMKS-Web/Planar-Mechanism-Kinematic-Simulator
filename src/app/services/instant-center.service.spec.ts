import { TestBed } from '@angular/core/testing';
import { InstantCenterDrawing, InstantCenterService } from './instant-center.service';
import { MechanismService } from './mechanism.service';

describe('instant-center visibility', () => {
  let service: InstantCenterService;
  const drawing = (selectionKey: string, machine = 'M1'): InstantCenterDrawing => ({
    machine,
    selectionKey,
    geometry: {
      bodies: ['ground', 'AB'],
      bodyOf: new Map(),
      origin: [0, 0],
      scale: 1,
      centers: [
        {
          id: '["AB","ground"]',
          bodies: ['ground', 'AB'],
          kind: 'fixed',
          location: 'finite',
          point: [0, 0, 1],
        },
      ],
    },
  });
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: MechanismService, useValue: { poseRevision: 0, partitions: [] } }],
    });
    service = TestBed.inject(InstantCenterService);
  });
  it('starts selected and keeps a choice through a rebuilt geometry and machine renumbering', () => {
    const first = drawing('B', 'M2');
    expect(service.selectedCenters(first).length).toBe(1);
    service.toggle(first, first.geometry.centers[0]);
    expect(service.selectedCenters(drawing('B', 'M1'))).toEqual([]);
    expect(service.selectedCenters(drawing('X', 'M2')).length).toBe(1);
  });
  it('bulk actions change all current machines without changing either overlay toggle', () => {
    const drawings = [drawing('B'), drawing('X', 'M2')];
    vi.spyOn(service, 'displayed').mockReturnValue(drawings);
    service.show.next(true);
    service.selectAll(false);
    expect(drawings.map((d) => service.selectedCenters(d).length)).toEqual([0, 0]);
    service.selectAll(true);
    expect(drawings.map((d) => service.selectedCenters(d).length)).toEqual([1, 1]);
    expect(service.show.value).toBe(true);
    expect(service.showConstruction.value).toBe(false);
  });
});
