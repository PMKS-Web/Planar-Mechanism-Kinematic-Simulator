import { TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { RevJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { ActiveObjService } from '../../services/active-obj.service';
import { DragStateService } from '../../services/drag-state.service';
import { GridUtilsService } from '../../services/grid-utils.service';
import { MechanismService } from '../../services/mechanism.service';
import { SvgGridService } from '../../services/svg-grid.service';
import { NewGridComponent } from './new-grid.component';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { MODEL_SCALE } from '../../model/render-scale';
import { BackgroundImageService } from '../../services/background-image.service';
import { SynthesisBuilderService } from '../../services/synthesis/synthesis-builder.service';
import { NotificationService } from '../../services/notification.service';
import { Coord } from '../../model/coord';
import { LONGEST_ARROW_FRACTION, PATH_ARROW_COUNT } from '../../model/vector-trace';

/**
 * NewGridComponent renders through svg-pan-zoom, which needs real SVG layout;
 * jsdom has none. Every suite here stands the component up against a stub that
 * maps screen coordinates straight through, so screen and SVG units are equal.
 */
async function configureGridTestBed() {
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
    // Decoding a URL asks for a fit. The stub has always been missing this; the
    // call used to be a second behind a timer, so it threw after the test had
    // finished, into nothing. It happens inline now.
    scaleToFitLinkage: vi.fn(),
    // These tests are about what a drag does, not about snapping, so the grid
    // here has no squares to snap to and hands every point back as it came.
    minorCellSize: 0,
    snapToGrid: (coord: { x: number; y: number }) => coord,
  };
  await TestBed.configureTestingModule({
    imports: [NewGridComponent],
    providers: [provideAnimations()],
  })
    .overrideProvider(SvgGridService, { useValue: svgGridStub })
    .compileComponents();
}

describe('NewGridComponent welded SVG presentation', () => {
  beforeEach(configureGridTestBed);

  it('renders one filleted root path plus dotted constituent paths when selected', () => {
    const mechanism = TestBed.inject(MechanismService);
    const active = TestBed.inject(ActiveObjService);
    // Model units (user units x MODEL_SCALE), so the link geometry and the
    // objectScale-derived link width keep the proportions the app renders at.
    const a = new RevJoint('A', 0, 0, true, true);
    const b = new RevJoint('B', 0, 4 * MODEL_SCALE);
    const c = new RevJoint('C', 3 * MODEL_SCALE, 5 * MODEL_SCALE);
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
    TestBed.inject(DragStateService).beginDraggingJoint();
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

/**
 * Two separate bars, A-B and C-D, with C sitting exactly where a drag to
 * (20, 20) lands. The SvgGridService stub maps screen coordinates straight
 * through, so those numbers are also the SVG coordinates.
 */
function twoBars(mechanism: MechanismService) {
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 5, 5);
  const c = new RevJoint('C', 20, 20);
  const d = new RevJoint('D', 30, 20, false, true);
  const wire = (id: string, joints: RevJoint[]) => {
    const link = new RealLink(id, joints);
    joints.forEach((joint) => {
      joint.links.push(link);
      joints.filter((o) => o !== joint).forEach((o) => joint.connectedJoints.push(o));
    });
    return link;
  };
  const ab = wire('AB', [a, b]);
  const cd = wire('CD', [c, d]);
  mechanism.joints = [a, b, c, d];
  mechanism.links = [ab, cd];
  mechanism.updateMechanism();
  return { a, b, c, d, ab, cd };
}

function drag(component: NewGridComponent, steps: number) {
  component.mouseDown(new MouseEvent('mousedown', { button: 0, clientX: 5, clientY: 5 }));
  for (let step = 1; step <= steps; step++) {
    const along = 5 + ((20 - 5) * step) / steps;
    component.mouseMove(new MouseEvent('mousemove', { clientX: along, clientY: along }));
  }
  component.mouseUp(new MouseEvent('mouseup'));
}

describe('NewGridComponent drag gestures', () => {
  beforeEach(configureGridTestBed);

  function setUp() {
    const mechanism = TestBed.inject(MechanismService);
    const scene = twoBars(mechanism);
    const fixture = TestBed.createComponent(NewGridComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    return { mechanism, component, fixture, ...scene };
  }

  // Undo is a stack of URL strings. A drag that saved per pointer-move would
  // make the user press undo once for every frame of a gesture.
  it('records exactly one undo entry for a multi-step joint drag', () => {
    const { mechanism, component, b } = setUp();
    const save = vi.spyOn(mechanism, 'save').mockImplementation(() => {});
    component.setLastLeftClick(b);

    drag(component, 8);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('records no undo entry for a click that only selected a joint', () => {
    const { mechanism, component, b } = setUp();
    const save = vi.spyOn(mechanism, 'save').mockImplementation(() => {});
    component.setLastLeftClick(b);

    component.mouseDown(new MouseEvent('mousedown', { button: 0, clientX: 5, clientY: 5 }));
    component.mouseUp(new MouseEvent('mouseup'));

    expect(save).not.toHaveBeenCalled();
  });

  it('merges the dragged joint into the one it is released over', () => {
    const { mechanism, component, b, c } = setUp();
    vi.spyOn(mechanism, 'save').mockImplementation(() => {});
    component.setLastLeftClick(b);

    drag(component, 8);

    expect(mechanism.joints.map((joint) => joint.id)).toEqual(['A', 'C', 'D']);
    expect(mechanism.links.map((link) => link.id).sort()).toEqual(['AC', 'CD']);
    expect(c.links.map((link) => link.id).sort()).toEqual(['AC', 'CD']);
  });

  it('still records one undo entry when the drag ends in a merge', () => {
    const { mechanism, component, b } = setUp();
    const save = vi.spyOn(mechanism, 'save').mockImplementation(() => {});
    component.setLastLeftClick(b);

    drag(component, 8);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('shows the snap indicator while hovering a legal target, and clears it on release', () => {
    const { mechanism, component, b, c } = setUp();
    vi.spyOn(mechanism, 'save').mockImplementation(() => {});
    component.setLastLeftClick(b);

    component.mouseDown(new MouseEvent('mousedown', { button: 0, clientX: 5, clientY: 5 }));
    component.mouseMove(new MouseEvent('mousemove', { clientX: 12, clientY: 12 }));
    expect(component.snapTargetJoint).toBeUndefined();

    component.mouseMove(new MouseEvent('mousemove', { clientX: 20, clientY: 20 }));
    expect(component.snapTargetJoint).toBe(c);

    component.mouseUp(new MouseEvent('mouseup'));
    expect(component.snapTargetJoint).toBeUndefined();
  });

  // A link drag translates by how far the pointer moved, not to where the
  // pointer is: the grab point stays under the cursor. The moves have to clear
  // the 10-unit hold that separates a drag from a click.
  it('drags a whole link, moving all of its joints and saving once', () => {
    const { mechanism, component, c, d, cd } = setUp();
    const save = vi.spyOn(mechanism, 'save').mockImplementation(() => {});
    component.setLastLeftClick(cd, new MouseEvent('mousedown'));

    component.mouseDown(new MouseEvent('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    component.mouseMove(new MouseEvent('mousemove', { clientX: 12, clientY: 13 }));
    component.mouseMove(new MouseEvent('mousemove', { clientX: 14, clientY: 16 }));
    component.mouseUp(new MouseEvent('mouseup'));

    expect([c.x, c.y]).toEqual([34, 36]);
    expect([d.x, d.y]).toEqual([44, 36]);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('holds a link still until the pointer clears the click threshold', () => {
    const { component, c, cd } = setUp();
    component.setLastLeftClick(cd, new MouseEvent('mousedown'));

    component.mouseDown(new MouseEvent('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    component.mouseMove(new MouseEvent('mousemove', { clientX: 3, clientY: 3 }));

    expect([c.x, c.y]).toEqual([20, 20]);
  });

  // A link drag accumulates pointer deltas, so the press has to record where
  // the gesture started. Without that, the first move would translate the link
  // by the distance from the last unrelated pointer event — a jump on grab.
  it('does not jump on the first move of a link drag', () => {
    const { component, c, cd } = setUp();
    component.mouseMove(new MouseEvent('mousemove', { clientX: 300, clientY: 300 }));
    component.setLastLeftClick(cd, new MouseEvent('mousedown'));

    component.mouseDown(new MouseEvent('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    component.mouseMove(new MouseEvent('mousemove', { clientX: 12, clientY: 13 }));

    expect([c.x, c.y]).toEqual([32, 33]);
  });

  // Analyze presents itself as read-only, and refused the edit context menu, but
  // dragging went straight through. Whole-link drag would have made that worse.
  it('refuses to drag anything while Analysis mode is showing', () => {
    const { component, b, c, cd } = setUp();
    TestBed.inject(SelectedTabService).setTab(TabID.ANALYZE);

    component.setLastLeftClick(b);
    drag(component, 8);
    component.setLastLeftClick(cd, new MouseEvent('mousedown'));
    component.mouseDown(new MouseEvent('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    component.mouseMove(new MouseEvent('mousemove', { clientX: 12, clientY: 13 }));
    component.mouseUp(new MouseEvent('mouseup'));

    expect([b.x, b.y]).toEqual([5, 5]);
    expect([c.x, c.y]).toEqual([20, 20]);
  });

  /**
   * ...and says so, once, and only to somebody who really tried.
   *
   * The refused drag above was silent: the joint stayed put and nothing said
   * why, which reads as a broken canvas rather than a fixed one. The two bars
   * here do not solve, so in an analysis mode they would be scenery and take
   * no click at all -- the refusal is about the mode rather than about this
   * machine, so the scene is told to treat them as live parts.
   */
  describe('the refusal a fixed geometry earns', () => {
    const said = () =>
      TestBed.inject(NotificationService).live.filter(
        (one) => one.id === 'analysis.geometry-fixed'
      );

    function inAnalysis() {
      const scene = setUp();
      TestBed.inject(SelectedTabService).setTab(TabID.ANALYZE);
      vi.spyOn(scene.mechanism, 'isPartInert').mockReturnValue(false);
      return scene;
    }

    it('names the way out when a part is dragged', () => {
      const { component, b } = inAnalysis();
      component.setLastLeftClick(b);
      drag(component, 8);
      expect(said().length).toBe(1);
      expect(said()[0].text).toContain('Edit mode');
    });

    it('says it once for a gesture, however many moves it takes', () => {
      const { component, b } = inAnalysis();
      component.setLastLeftClick(b);
      drag(component, 20);
      expect(said().length).toBe(1);
    });

    it('stays quiet for a click that only selected the part', () => {
      const { component, b } = inAnalysis();
      component.setLastLeftClick(b);
      component.mouseDown(new MouseEvent('mousedown', { button: 0, clientX: 5, clientY: 5 }));
      component.mouseUp(new MouseEvent('mouseup'));
      expect(said().length).toBe(0);
    });

    it('stays quiet for a press that never leaves the click threshold', () => {
      const { component, b } = inAnalysis();
      component.setLastLeftClick(b);
      component.mouseDown(new MouseEvent('mousedown', { button: 0, clientX: 5, clientY: 5 }));
      component.mouseMove(new MouseEvent('mousemove', { clientX: 7, clientY: 8 }));
      component.mouseUp(new MouseEvent('mouseup'));
      expect(said().length).toBe(0);
    });

    it('stays quiet where the geometry can actually be moved', () => {
      const { component, b } = setUp();
      component.setLastLeftClick(b);
      drag(component, 8);
      expect(said().length).toBe(0);
    });
  });

  // A drag let go of over the floating panel comes up on the window, not on the
  // canvas, so `mouseUp` never fires. Left unreleased the joint kept following a
  // button-less cursor, panning stayed refused, and the move earned no undo
  // entry.
  it('commits a joint drag released away from the grid', () => {
    const { mechanism, component, b } = setUp();
    const save = vi.spyOn(mechanism, 'save').mockImplementation(() => {});
    const dragState = TestBed.inject(DragStateService);
    component.setLastLeftClick(b);

    component.mouseDown(new MouseEvent('mousedown', { button: 0, clientX: 5, clientY: 5 }));
    // Far enough to clear the hold that separates a drag from a click. B is
    // then captured by C, so the release has the whole of a drop to land.
    component.mouseMove(new MouseEvent('mousemove', { clientX: 14, clientY: 14 }));
    expect(dragState.isDragging).toBe(true);

    component.releaseCanvasGestures(new MouseEvent('pointerup') as PointerEvent);

    expect(dragState.isDragging).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(mechanism.joints.map((joint) => joint.id)).toEqual(['A', 'C', 'D']);
  });
});

describe('NewGridComponent keyboard shortcuts', () => {
  beforeEach(configureGridTestBed);

  function setUp() {
    const fixture = TestBed.createComponent(NewGridComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  // Everything selectable that has a Delete of its own has to answer this key.
  // Left out, it cleared the selection and left the object standing, which
  // reads as a delete that did not take.
  it('takes away the background image it has selected', () => {
    const component = setUp();
    const bgImage = TestBed.inject(BackgroundImageService);
    bgImage.image.set({
      src: 'data:image/png;base64,',
      naturalWidth: 100,
      naturalHeight: 50,
      centerX: 0,
      centerY: 0,
      width: 10,
      rotationRad: 0,
      opacity: 0.5,
      fileName: 'trace.png',
    });
    TestBed.inject(ActiveObjService).selectBackgroundImage();

    component['onShortcut']('edit.delete');

    expect(bgImage.image()).toBeNull();
  });

  it('takes away the synthesis position it has selected', () => {
    const component = setUp();
    const builder = TestBed.inject(SynthesisBuilderService);
    vi.spyOn(TestBed.inject(MechanismService), 'save').mockImplementation(() => {});
    builder.placePose(new Coord(1, 1));
    TestBed.inject(ActiveObjService).updateSelectedObj(builder.getPose(1));

    component['onShortcut']('edit.delete');

    expect(builder.getAllPoses().length).toBe(0);
  });

  // `getSelectedObj` throws for everything it has no case for, so asking it
  // before checking the type turned "there is nothing to lock" into an uncaught
  // error on a fresh grid.
  it('refuses the lock key on an empty grid instead of throwing', () => {
    const component = setUp();
    const refusal = vi.spyOn(TestBed.inject(NotificationService), 'refusal');
    TestBed.inject(ActiveObjService).objType = 'Nothing';

    expect(() => component['onShortcut']('edit.lock')).not.toThrow();
    expect(refusal).toHaveBeenCalled();
  });
});

/**
 * A vector trace is a picture of something a graph can only tabulate: which
 * way the quantity points, at each place the part passes through. Everything
 * here is about the two halves agreeing -- the pale arrows along the cycle and
 * the heavy one at the pose share a scale, or the live one reads as a spike.
 */
describe('NewGridComponent vector traces', () => {
  beforeEach(configureGridTestBed);

  function analysing() {
    const mechanism = TestBed.inject(MechanismService);
    const scene = twoBars(mechanism);
    TestBed.inject(SelectedTabService).setTab(TabID.ANALYZE);
    return { mechanism, ...scene };
  }

  it('draws nothing until a part is switched on', () => {
    const { mechanism } = analysing();
    expect(mechanism.anyVectorTrace).toBe(false);
    expect(mechanism.vectorTracePaths()).toEqual([]);
  });

  it('spaces arrows along the whole cycle, and puts one at the pose', () => {
    const { mechanism, b } = analysing();
    mechanism.toggleVectorTrace(b, 'velocity');

    const [trace] = mechanism.vectorTracePaths();
    expect(trace.key).toBe('velocity:B');
    // A shaft and two barbs per arrow, and two dozen arrows for the cycle --
    // not one per solved sample, which is 361 of them.
    expect(trace.d.split('M').length - 1).toBe(3 * PATH_ARROW_COUNT);

    const [live] = mechanism.liveVectorArrows();
    // Attached to the part: the tail is where the joint is drawn right now.
    expect([live.x, live.y]).toEqual([b.x, b.y]);
    expect(live.d.split('M').length - 1).toBe(3);
  });

  it('scales the biggest arrow of a cycle against the size of the machine', () => {
    const { mechanism, b } = analysing();
    mechanism.toggleVectorTrace(b, 'velocity');
    const longest = Math.max(...shaftLengths(mechanism.vectorTracePaths()[0].d));
    // The crank sweeps a circle of radius sqrt(50) about the origin, so its
    // swept box has a diagonal of 4 * sqrt(50) / sqrt(2) -- and the longest
    // arrow is the agreed fraction of that.
    const span = Math.hypot(2 * Math.hypot(5, 5), 2 * Math.hypot(5, 5));
    expect(longest).toBeCloseTo(span * LONGEST_ARROW_FRACTION, 3);
  });

  it('keeps each mode to the vectors that mode is about', () => {
    const { mechanism, b } = analysing();
    mechanism.toggleVectorTrace(b, 'velocity');
    expect(mechanism.vectorTracePaths().length).toBe(1);
    TestBed.inject(SelectedTabService).setTab(TabID.FORCE);
    expect(mechanism.vectorTracePaths()).toEqual([]);
    TestBed.inject(SelectedTabService).setTab(TabID.EDIT);
    expect(mechanism.vectorTracePaths()).toEqual([]);
  });

  it('forgets a switch whose part has been deleted', () => {
    const { mechanism, b } = analysing();
    mechanism.toggleVectorTrace(b, 'velocity');
    mechanism.joints = mechanism.joints.filter((joint) => joint.id !== 'B');
    expect(mechanism.vectorTracePaths()).toEqual([]);
    expect(mechanism.anyVectorTrace).toBe(false);
  });
});

/** The shaft of every arrow in a path: each one is the first leg of a triple. */
function shaftLengths(d: string): number[] {
  const legs = d.split('M').filter((piece) => piece.trim() !== '');
  return legs
    .filter((_, index) => index % 3 === 0)
    .map((leg) => {
      const [x1, y1, x2, y2] = leg
        .split('L')
        .flatMap((half) => half.trim().split(/\s+/).map(Number));
      return Math.hypot(x2 - x1, y2 - y1);
    });
}
