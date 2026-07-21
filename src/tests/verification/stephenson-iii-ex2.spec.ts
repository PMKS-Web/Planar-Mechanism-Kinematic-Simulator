// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { stephensonIiiEx210Rpm } from '../../test-data/verification/stephenson-iii-ex2-10rpm';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { stephensonIiiEx2Fixture } from '../../test-utils/verification/fixtures';
import {
  registerDynamicsSuite,
  registerKinematicsSuite,
} from '../../test-utils/verification/suites';

const TOGGLE_EXCLUSIONS = [
  {
    rows: [40, 41, 42, 140, 141, 142],
    actualTimesteps: [40, 41, 139, 140],
    reason: 'PMKS+ and MATLAB reverse the rocking input at adjacent one-degree samples',
  },
];

// Stephenson III six-bar with a limited input rotation range (the MATLAB
// export covers 201 one-degree rows before hitting a toggle) and a constant
// 50 N x-load applied at the midpoint of output link FG, verified against
// PMKS-Web/PMKS_Verification (Stephenson_III/Example_2, 10 RPM).
describe('Stephenson III Example 2 @ 10 RPM vs MATLAB', () => {
  describe('kinematics', () => {
    registerKinematicsSuite(
      stephensonIiiEx210Rpm,
      () => buildMechanism(stephensonIiiEx2Fixture()),
      { toggleExclusions: TOGGLE_EXCLUSIONS }
    );
  });

  describe('dynamic force analysis (gravity on)', () => {
    registerDynamicsSuite(
      'Stephenson_III Example_2 Newton/Grav',
      stephensonIiiEx210Rpm.dynamics!.grav,
      stephensonIiiEx210Rpm,
      () => buildMechanism(stephensonIiiEx2Fixture(true)),
      { toggleExclusions: TOGGLE_EXCLUSIONS }
    );
  });

  describe('dynamic force analysis (gravity off)', () => {
    registerDynamicsSuite(
      'Stephenson_III Example_2 Newton/NoGrav',
      stephensonIiiEx210Rpm.dynamics!.noGrav!,
      stephensonIiiEx210Rpm,
      () => buildMechanism(stephensonIiiEx2Fixture(false)),
      { toggleExclusions: TOGGLE_EXCLUSIONS }
    );
  });
});
