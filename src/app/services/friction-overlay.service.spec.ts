import { Injector } from '@angular/core';
import { buildMechanismFixture } from '../../tests/fixtures/mechanism-fixtures';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import {
  frictionSliderCrankFixture,
  frictionBearingFixture,
  frictionCombinedFixture,
} from '../../test-utils/verification/friction-fixtures';
import { FrictionOverlayService } from './friction-overlay.service';
import { FrictionService } from './friction.service';
import { MechanismService } from './mechanism.service';
import { SettingsService } from './settings.service';
import { AnalysisSampleService } from './analysis-sample.service';
import { NumberUnitParserService } from './number-unit-parser.service';
import { EditPermissionService } from './edit-permission.service';
import { RealJoint } from '../model/joint';
import { ForceUnit } from '../model/unit-enums';
import { Mechanism } from '../model/mechanism/mechanism';
import { ForceSolver } from '../model/mechanism/force-solver';

function setup(spec = frictionSliderCrankFixture()) {
  const built = buildMechanismFixture(fixturePayload(spec));
  // This older URL test harness uses the global speed default. Give this solve the
  // fixture's signed prescribed rate, as the app's per-machine constructor does.
  built.mechanism = new Mechanism(
    built.service.joints,
    built.service.links,
    built.service.forces,
    [],
    spec.gravity ?? false,
    'cm',
    spec.inputAngVel
  );
  built.service.mechanisms = [built.mechanism];
  const injector = Injector.create({
    providers: [
      { provide: MechanismService, useValue: built.service },
      { provide: SettingsService, useValue: built.settings },
      { provide: EditPermissionService, useValue: { refusal: () => undefined } },
      { provide: AnalysisSampleService, deps: [] },
      { provide: NumberUnitParserService, deps: [] },
      { provide: FrictionService, deps: [] },
      { provide: FrictionOverlayService, deps: [] },
    ],
  });
  built.settings.forceAnalysisMode.next('static');
  return {
    ...built,
    overlay: injector.get(FrictionOverlayService),
    friction: injector.get(FrictionService),
  };
}
describe('current-sample friction overlays and readings', () => {
  it('reads the coupled contact force and a separate three-way input comparison', () => {
    const h = setup();
    const load = h.overlay.overlays()[0];
    expect(load.effort).toBeCloseTo(18.75, 8);
    expect(load.fx).toBeCloseTo(18.75, 8);
    expect(load.labelText).toContain('18.75 N');
    expect(load.bodyId).toBe('CD');
    const reading = h.friction.reading(h.service.joints.find((j) => j.id === 'D') as RealJoint);
    expect(reading.additionalEffort).toBeCloseTo(50, 8);
    expect(reading.totalEffort! - reading.frictionlessEffort!).toBeCloseTo(50, 8);
  });
  it('updates the arrow from the machine sample, including a sliding reversal', () => {
    const h = setup();
    const first = h.overlay.overlays()[0];
    const frames = h.mechanism.getForceAnalysis('static').frames;
    const reversed = frames.findIndex((frame) => (frame.friction?.get('D')?.effort ?? 0) < 0);
    expect(reversed).toBeGreaterThan(0);
    h.service.mechanismTimeStep = reversed;
    const next = h.overlay.overlays()[0];
    expect(next.fx).toBeLessThan(0);
    expect(next.d).not.toBe(first.d);
  });
  it('hides all numeric results at a solved stationary-contact refusal', () => {
    const h = setup(frictionBearingFixture());
    // Sampled finite-difference rates need not hit an exact zero. Supply an actual
    // stationary domain solve, then exercise the adapter against its refusal metadata.
    const frame = ForceSolver.analyzeFrame(
      h.mechanism.joints[0],
      h.mechanism.links[0],
      'static',
      false,
      'cm',
      0,
      undefined,
      false,
      { coordinateScale: 200, jointVelocities: new Map(), angularVelocities: new Map([['AB', 0]]) }
    );
    const series = h.mechanism.getForceAnalysis('static');
    h.mechanism.getForceAnalysis = () => ({ ...series, frames: [frame] });
    const reading = h.friction.reading(h.service.joints[0] as RealJoint);
    expect(reading.state).toBe('Stationary');
    expect(reading.values).toBeUndefined();
    expect(reading.additionalEffort).toBeUndefined();
    expect(h.overlay.overlays()).toEqual([]);
  });
  it('converts bearing labels into the selected force units without changing direction', () => {
    const h = setup(frictionBearingFixture());
    expect(h.overlay.overlays()[0].labelText).toContain('-10 N·cm');
    h.settings.forceUnit.next(ForceUnit.LBF);
    const load = h.overlay.overlays()[0];
    expect(load.labelText).toContain('lbf');
    expect(load.sweep).toBeLessThan(0);
  });
  it('associates combined loads with their own contacts rather than drawing actuator deltas', () => {
    const h = setup(frictionCombinedFixture());
    expect(
      h.overlay
        .overlays()
        .map((load) => load.jointId)
        .sort()
    ).toEqual(['A', 'D']);
    expect(
      h.overlay
        .overlays()
        .map((load) => load.kind)
        .sort()
    ).toEqual(['force', 'torque']);
  });
  it('hides overlays with the view switch without disabling friction', () => {
    const h = setup();
    h.overlay.visible.set(false);
    expect(h.overlay.overlays()).toEqual([]);
    expect(
      (h.service.joints.find((j) => j.id === 'D') as RealJoint).friction.kineticCoefficient
    ).toBe(0.2);
  });
  it('does not draw disabled contacts or report their input contribution', () => {
    const h = setup();
    const joint = h.service.joints.find((j) => j.id === 'D') as RealJoint;
    joint.friction = { staticCoefficient: 0, kineticCoefficient: 0, radius: 0 };
    expect(h.overlay.overlays()).toEqual([]);
    expect(h.friction.reading(joint)).toEqual({ state: 'Off' });
  });
  it('withholds all plausible-looking loads when the In-motion inertia guard applies', () => {
    const spec = frictionBearingFixture();
    spec.links[0].mass = 1000;
    const h = setup(spec);
    h.settings.forceAnalysisMode.next('dynamic');
    expect(h.overlay.overlays()).toEqual([]);
    const reading = h.friction.reading(h.service.joints[0] as RealJoint);
    expect(reading.state).toBe('Unavailable');
    expect(reading.message).toContain('scaling error');
    expect(reading.values).toBeUndefined();
    expect(reading.totalEffort).toBeUndefined();
  });
});
