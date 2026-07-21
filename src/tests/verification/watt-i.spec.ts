// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { wattI10Rpm } from '../../test-data/verification/watt-i-10rpm';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { wattIFixture } from '../../test-utils/verification/fixtures';
import {
  registerDynamicsSuite,
  registerKinematicsSuite,
} from '../../test-utils/verification/suites';

const TOGGLE_EXCLUSIONS = [
  {
    rows: [4, 5, 6, 15, 16, 17],
    actualTimesteps: [4, 5, 14, 15],
    reason: 'PMKS+ and MATLAB reverse the rocking input at adjacent one-degree samples',
  },
];

// Watt I six-bar whose input can only rock through a few degrees (the MATLAB
// export covers 23 rows sweeping forward and back), with a constant
// [50, 25] N load applied at the geometric center of output link CFG.
// Verified against PMKS-Web/PMKS_Verification (Watt_I, 10 RPM). This is the
// same geometry as the original SixbarService spec in app.component.spec.ts.
//
// PMKS+ and MATLAB detect the toggle points a step or two apart, so a couple
// of rows at the extremes may legitimately go unmatched (rows are aligned by
// crank angle and sweep direction, not index).
describe('Watt I @ 10 RPM vs MATLAB', () => {
  describe('kinematics', () => {
    registerKinematicsSuite(wattI10Rpm, () => buildMechanism(wattIFixture()), {
      toggleExclusions: TOGGLE_EXCLUSIONS,
    });
  });

  describe('dynamic force analysis (gravity on)', () => {
    registerDynamicsSuite(
      'Watt_I Newton/Grav',
      wattI10Rpm.dynamics!.grav,
      wattI10Rpm,
      () => buildMechanism(wattIFixture(true)),
      { toggleExclusions: TOGGLE_EXCLUSIONS }
    );
  });

  describe('dynamic force analysis (gravity off)', () => {
    registerDynamicsSuite(
      'Watt_I Newton/NoGrav',
      wattI10Rpm.dynamics!.noGrav!,
      wattI10Rpm,
      () => buildMechanism(wattIFixture(false)),
      { toggleExclusions: TOGGLE_EXCLUSIONS }
    );
  });
});
