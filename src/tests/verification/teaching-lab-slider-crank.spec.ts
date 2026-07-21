// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { teachingLabSliderCrank151Rpm } from '../../test-data/verification/teaching-lab-slider-crank-15-1rpm';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { teachingLabSliderCrankFixture } from '../../test-utils/verification/fixtures';
import { registerKinematicsSuite } from '../../test-utils/verification/suites';

// Crank-slider verified against the MATLAB solvers in
// PMKS-Web/PMKS_Verification (TeachingLab_Slider_Crank, 15.1 RPM). The
// MATLAB link BCE includes sensor point E mounted exactly at joint B, so E is
// compared to B and BCE corresponds to PMKS+ link BC. The prismatic joint is D.
describe('TeachingLab slider-crank @ 15.1 RPM vs MATLAB', () => {
  describe('kinematics', () => {
    registerKinematicsSuite(
      teachingLabSliderCrank151Rpm,
      () => buildMechanism(teachingLabSliderCrankFixture()),
      {
        jointIdOf: { E: 'B' },
        linkIdOf: { BCE: 'BC' },
      }
    );
  });
});
