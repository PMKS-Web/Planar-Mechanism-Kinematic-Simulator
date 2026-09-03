import { TestBed } from '@angular/core/testing';
import { Coord } from '../../model/coord';
import { RealJoint } from '../../model/joint';
import { MODEL_SCALE } from '../../model/render-scale';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { SynthesisBuilderService } from './synthesis-builder.service';
import { SynthesisSolutionService } from './synthesis-solution.service';
import { COR } from './synthesis-util';

/**
 * The preview turns the way its arrow points, and Insert has to hand that on:
 * a reader who reversed the preview before inserting expects the linkage on
 * the grid to turn the way they were just watching it turn, not whichever way
 * the document's drive was last set. Negative is clockwise, which
 * `turnsClockwise` says once for the whole app.
 */

const S = MODEL_SCALE;

describe('inserting a synthesized linkage', () => {
  let solution: SynthesisSolutionService;
  let mechanism: MechanismService;
  let settings: SettingsService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    mechanism = TestBed.inject(MechanismService);
    settings = TestBed.inject(SettingsService);
    solution = TestBed.inject(SynthesisSolutionService);
    // The gentle sweep the driveability spec knows offers defect-free answers.
    TestBed.inject(SynthesisBuilderService).applyDecoded({
      length: 5 * S,
      reference: COR.BACK,
      endsOnly: false,
      allowDefect: false,
      constrain: false,
      stage: 'working',
      poses: [
        { at: new Coord(0, 0), thetaDegrees: 0 },
        { at: new Coord(4 * S, 2 * S), thetaDegrees: 25 },
        { at: new Coord(7 * S, 7 * S), thetaDegrees: 50 },
      ],
      ownedJointIds: [],
    });
    solution.generate();
    vi.advanceTimersByTime(5000);
  });

  afterEach(() => {
    mechanism.animate(0, false);
    vi.useRealTimers();
  });

  const driven = (): RealJoint => {
    const joint = mechanism.joints.find((j): j is RealJoint => j instanceof RealJoint && j.input);
    if (!joint) throw new Error('nothing on the grid is driven');
    return joint;
  };

  it('has something to insert', () => {
    expect(solution.driven()).not.toBeNull();
  });

  it('lands turning clockwise when the preview did', () => {
    settings.isInputCW.next(false);
    solution.clockwise = true;
    expect(solution.insert(true)).toBe('done');
    expect(mechanism.driveSpeedOf(driven())).toBeLessThan(0);
    expect(settings.isInputCW.value).toBe(true);
  });

  it('lands turning counterclockwise when the preview did', () => {
    settings.isInputCW.next(true);
    solution.clockwise = false;
    expect(solution.insert(true)).toBe('done');
    expect(mechanism.driveSpeedOf(driven())).toBeGreaterThan(0);
    expect(settings.isInputCW.value).toBe(false);
  });

  it('keeps the document speed, since the preview never had one', () => {
    settings.inputSpeed.next(12);
    solution.clockwise = true;
    solution.insert(true);
    expect(Math.abs(mechanism.driveSpeedOf(driven()))).toBe(12);
  });

  it('carries the direction onto the far pin, and onto a driver dyad, alike', () => {
    solution.driveOnFarPin = true;
    solution.clockwise = false;
    expect(solution.insert(true)).toBe('done');
    expect(mechanism.driveSpeedOf(driven())).toBeGreaterThan(0);

    solution.driveOnFarPin = false;
    solution.driverWanted = true;
    solution.clockwise = true;
    // A driver dyad puts the motor on its own ground, off the four-bar, so
    // the direction has to reach a joint the four-bar never had.
    expect(solution.dyad()).toBeTruthy();
    expect(solution.insert(true)).toBe('done');
    expect(mechanism.driveSpeedOf(driven())).toBeLessThan(0);
  });
});
