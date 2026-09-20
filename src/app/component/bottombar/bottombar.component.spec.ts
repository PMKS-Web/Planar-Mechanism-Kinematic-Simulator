import { TestBed } from '@angular/core/testing';
import { BottombarComponent } from './bottombar.component';
import { ActiveObjService } from '../../services/active-obj.service';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { SvgGridService } from '../../services/svg-grid.service';
import { Coord } from '../../model/coord';
import { RealLink } from '../../model/link';
import { MODEL_SCALE } from '../../model/render-scale';
import { LengthUnit } from '../../model/utils';

// Found by building a linkage with a real mouse rather than with dispatched
// events: the very first bar anybody draws is not grounded, mobility is not a
// number until something is, and the bottom bar was printing the NaN it got.

describe('the mobility readout', () => {
  let component: BottombarComponent;
  let mechanism: MechanismService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BottombarComponent] });
    component = TestBed.createComponent(BottombarComponent).componentInstance;
    mechanism = TestBed.inject(MechanismService);
  });

  // MechanismService is a root singleton and its `mechanisms` array outlives a
  // TestBed, so put back whatever was there: a spec that leaves it truncated
  // fails a completely unrelated file later in the run.
  let original: unknown[];
  beforeEach(() => {
    original = [...(mechanism.mechanisms as unknown as unknown[])];
  });
  afterEach(() => {
    (mechanism.mechanisms as unknown as unknown[]).length = 0;
    (mechanism.mechanisms as unknown as unknown[]).push(...original);
  });

  const withDof = (dof: number) => {
    (mechanism.mechanisms as unknown as { dof: number }[])[0] = { dof };
  };

  it('shows a dash before there is any mechanism at all', () => {
    // A freshly opened app has no entry in `mechanisms` yet, and the template
    // used to reach straight through it for `.dof`.
    (mechanism.mechanisms as unknown as unknown[]).length = 0;
    expect(component.degreesOfFreedom).toBe('—');
  });

  it('calls a deferred large drawing ready without claiming it has already solved', () => {
    (mechanism.mechanisms as unknown as unknown[]).length = 0;
    const state = mechanism as unknown as { solvingDeferred: boolean };
    const before = state.solvingDeferred;
    state.solvingDeferred = true;
    expect(component.status).toBe('Ready to analyze · motion solves when you press Play');
    state.solvingDeferred = before;
  });

  it('clears a stale cursor reading when the model unit changes', () => {
    const settings = TestBed.inject(SettingsService);
    const grid = TestBed.inject(SvgGridService);
    settings.lengthUnit.next(LengthUnit.CM);
    grid.cursorAt = { x: 330, y: 366 };
    expect(component.cursor).toBe('1.65 cm, 1.83 cm');
    settings.lengthUnit.next(LengthUnit.INCH);
    expect(component.cursor).toBe('');
    settings.lengthUnit.next(LengthUnit.CM);
  });

  it('shows a dash rather than NaN when nothing is grounded', () => {
    withDof(NaN);
    expect(component.degreesOfFreedom).toBe('—');
  });

  it('still shows the number when there is one, including zero', () => {
    withDof(1);
    expect(component.degreesOfFreedom).toBe('1');
    // Zero is a real answer -- an over-constrained linkage -- and must not be
    // swallowed by a falsy check.
    withDof(0);
    expect(component.degreesOfFreedom).toBe('0');
    // So is a negative one, which is how an over-constrained mechanism reads
    // before the rigid-body grouping gets to it.
    withDof(-1);
    expect(component.degreesOfFreedom).toBe('-1');
  });
});

// The strip names a held body, and it named it by its link id -- which is the
// letters of its joints. That is a fine key and a poor name for a cylinder
// member: the barrel's id holds the buried end nothing draws, and both members
// have panels and menus that call them Barrel AC and Rod CB (decision S10). One
// label, so the three cannot disagree.
describe('what the strip calls a body holding a value', () => {
  let component: BottombarComponent;
  let mechanism: MechanismService;
  let active: ActiveObjService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BottombarComponent] });
    component = TestBed.createComponent(BottombarComponent).componentInstance;
    mechanism = TestBed.inject(MechanismService);
    active = TestBed.inject(ActiveObjService);
    mechanism.resetMechanism();
  });
  afterEach(() => mechanism.resetMechanism());

  it('calls an ordinary bar a Link, exactly as it always has', () => {
    const bar = mechanism.addBar(new Coord(0, 0), new Coord(2 * MODEL_SCALE, 0))!;
    bar.hold = 'length';
    active.updateSelectedObj(bar);
    expect(component.status).toBe(`Link ${bar.id}: fixed length`);
  });

  it('calls a cylinder member by its own name', () => {
    mechanism.createCylinderFrom(new Coord(0, 0), new Coord(6 * MODEL_SCALE, 0));
    mechanism.finishStructuralEdit(true);
    const ram = mechanism.sealedStructures()[0];
    const rod = ram.rod as RealLink;
    rod.hold = 'length';
    active.updateSelectedObj(rod);

    expect(component.status).toBe(
      `Rod ${ram.seal.name || ram.seal.id}${ram.mountB.name || ram.mountB.id}: fixed length`
    );
    // And not the id, which names a joint the reader was never shown.
    expect(component.status).not.toContain(`Link ${rod.id}`);
  });
});
