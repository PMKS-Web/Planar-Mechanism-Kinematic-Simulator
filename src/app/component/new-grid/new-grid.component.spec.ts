import { TestBed } from '@angular/core/testing';
import { AppModule } from '../../app.module';
import { RevJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { jointStates } from '../../model/utils';
import { ActiveObjService } from '../../services/active-obj.service';
import { GridUtilsService } from '../../services/grid-utils.service';
import { MechanismService } from '../../services/mechanism.service';
import { SvgGridService } from '../../services/svg-grid.service';
import { NewGridComponent } from './new-grid.component';

describe('NewGridComponent welded SVG presentation', () => {
  beforeEach(async () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as typeof matchMedia;
    const svgGridStub = {
      horizontalLines: [],
      horizontalLinesMinor: [],
      verticalLines: [],
      verticalLinesMinor: [],
      viewBoxMinX: -10,
      viewBoxMaxX: 10,
      viewBoxMinY: -10,
      viewBoxMaxY: 10,
      panZoomObject: { resize: vi.fn(), fit: vi.fn(), center: vi.fn() },
      getZoom: () => 1,
      scaleWithZoom: (value: number) => value,
      screenToSVGfromXY: (x: number, y: number) => ({ x, y }),
      SVGtoScreen: (coord: { x: number; y: number }) => coord,
      setNewElement: (element: HTMLElement) => element.classList.add('svg-pan-zoom_viewport'),
    };
    await TestBed.configureTestingModule({ imports: [AppModule] })
      .overrideProvider(SvgGridService, { useValue: svgGridStub })
      .compileComponents();
  });

  it('renders one filleted root path plus dotted constituent paths when selected', () => {
    const mechanism = TestBed.inject(MechanismService);
    const active = TestBed.inject(ActiveObjService);
    const a = new RevJoint('A', 0, 0, true, true);
    const b = new RevJoint('B', 0, 4);
    const c = new RevJoint('C', 3, 5);
    const ab = new RealLink('AB', [a, b]);
    const bc = new RealLink('BC', [b, c]);
    const compound = new RealLink('ABC', [a, b, c], 2, 1, undefined, [ab, bc]);
    compound.fill = '#303e9f';
    b.isWelded = true;
    a.links = [compound];
    b.links = [compound];
    c.links = [compound];
    mechanism.joints = [a, b, c];
    mechanism.links = [compound];
    active.objType = 'Link';
    active.selectedLink = compound;

    const fixture = TestBed.createComponent(NewGridComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement.querySelector('#ABC') as SVGPathElement;
    const components = fixture.nativeElement.querySelectorAll('#ABC__components path');
    expect(root.tagName.toLowerCase()).toBe('path');
    expect(root.getAttribute('d')).toContain('Q');
    expect(components.length).toBe(2);
    expect(components[0].getAttribute('stroke-dasharray')).not.toBeNull();
    expect(components[0].getAttribute('d')).toBe(ab.d);
    expect(components[1].getAttribute('d')).toBe(bc.d);
  });

  it('rebuilds the mechanism only once for each joint-drag event', () => {
    const mechanism = TestBed.inject(MechanismService);
    const active = TestBed.inject(ActiveObjService);
    const gridUtils = TestBed.inject(GridUtilsService);
    const joint = new RevJoint('A', 0, 0);
    mechanism.joints = [joint];
    mechanism.links = [];
    active.selectedJoint = joint;

    const fixture = TestBed.createComponent(NewGridComponent);
    const component = fixture.componentInstance;
    component['jointStates'] = jointStates.dragging;
    component['timeMouseDown'] = 0;
    component['startX'] = 0;
    component['startY'] = 0;
    const drag = vi.spyOn(gridUtils, 'dragJoint');
    const rebuild = vi.spyOn(mechanism, 'updateMechanism');

    component.mouseMove(new MouseEvent('mousemove', { clientX: 20, clientY: 20 }));

    expect(drag).toHaveBeenCalledTimes(1);
    expect(rebuild).toHaveBeenCalledTimes(1);
  });
});
