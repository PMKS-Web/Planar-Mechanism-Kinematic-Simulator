// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { teachingLabFourBar1031Rpm } from '../../test-data/verification/teaching-lab-four-bar-10-31rpm';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { teachingLabFourBarFixture } from '../../test-utils/verification/fixtures';
import { registerKinematicsSuite } from '../../test-utils/verification/suites';

// Four-bar linkage with tracer points on every link and CAD-measured mass
// properties, verified against the MATLAB solvers in
// PMKS-Web/PMKS_Verification (TeachingLab_Four_Bar, 10.31 RPM).
// MATLAB tracer-acceleration defects in E/G/H were corrected before the v1
// data was cross-checked against the pinned PMKS fork and MotionGen.
describe('TeachingLab four-bar @ 10.31 RPM vs MATLAB', () => {
  describe('kinematics', () => {
    registerKinematicsSuite(teachingLabFourBar1031Rpm, () =>
      buildMechanism(teachingLabFourBarFixture())
    );
  });
});
