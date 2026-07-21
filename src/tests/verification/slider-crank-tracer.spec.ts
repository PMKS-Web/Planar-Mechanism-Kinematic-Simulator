// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { sliderCrankTracer10Rpm } from '../../test-data/verification/slider-crank-tracer-10rpm';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { sliderCrankTracerFixture } from '../../test-utils/verification/fixtures';
import { registerKinematicsSuite } from '../../test-utils/verification/suites';

// Crank-slider with a tracer point D on the coupler, verified against the
// MATLAB solvers in PMKS-Web/PMKS_Verification (Slider_Crank_Tracer_Point,
// 10 RPM). Kinematics only: the MATLAB run never exported force data for
// this mechanism.
// The earlier MATLAB slider/tracer sign defects were corrected before this v1
// data was cross-checked against the pinned PMKS fork.
describe('Slider-crank with tracer point @ 10 RPM vs MATLAB', () => {
  describe('kinematics', () => {
    registerKinematicsSuite(sliderCrankTracer10Rpm, () =>
      buildMechanism(sliderCrankTracerFixture())
    );
  });
});
