import { VerificationDataset } from '../../test-data/verification/types';
import { sliderCrankTracer10Rpm } from '../../test-data/verification/slider-crank-tracer-10rpm';
import { stephensonIiiEx210Rpm } from '../../test-data/verification/stephenson-iii-ex2-10rpm';
import { teachingLabFourBar1031Rpm } from '../../test-data/verification/teaching-lab-four-bar-10-31rpm';
import { teachingLabSliderCrank151Rpm } from '../../test-data/verification/teaching-lab-slider-crank-15-1rpm';
import { wattI10Rpm } from '../../test-data/verification/watt-i-10rpm';
import {
  sliderCrankTracerFixture,
  stephensonIiiEx2Fixture,
  teachingLabFourBarFixture,
  teachingLabSliderCrankFixture,
  wattIFixture,
} from '../verification/fixtures';
import { MechanismFixture } from '../verification/fixture';
import { fixtureProblem } from './fixture-problem';
import { OracleProblem } from './export-problem';

/** A MATLAB v1 case: its dataset, and the fixture that transcribes its model. */
export interface MatlabCase {
  dataset: VerificationDataset;
  problem: OracleProblem;
}

const cases: [string, VerificationDataset, (gravity: boolean) => MechanismFixture][] = [
  ['slider-crank-tracer', sliderCrankTracer10Rpm, () => sliderCrankTracerFixture()],
  ['stephenson-iii-ex2', stephensonIiiEx210Rpm, stephensonIiiEx2Fixture],
  ['teaching-lab-four-bar', teachingLabFourBar1031Rpm, teachingLabFourBarFixture],
  ['teaching-lab-slider-crank', teachingLabSliderCrank151Rpm, teachingLabSliderCrankFixture],
  ['watt-i', wattI10Rpm, wattIFixture],
];

/**
 * The problems are solved with gravity on, so a reference carries both the
 * gravity and the no-gravity force cases' kinematics alike: kinematics do not
 * depend on it, and the MATLAB dynamics are given with gravity (`grav`).
 */
export function matlabCases(): MatlabCase[] {
  return cases.map(([name, dataset, fixture]) => ({
    dataset,
    problem: fixtureProblem(`matlab.${name}`, `MATLAB v1 ${dataset.name}`, fixture(true)),
  }));
}
