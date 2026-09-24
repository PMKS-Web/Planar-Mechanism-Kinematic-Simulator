// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { MechanismFixture } from '../../test-utils/verification/fixture';
import { followAdvice, readDrawing } from '../../test-utils/verification/follow-advice';
import {
  braceAtInputFixture,
  deletedRockerFixture,
  frameBarFixture,
  groundedWattJointFixture,
  inputOnCouplerPointFixture,
  linkHangingFromPivotFixture,
  rockerBesideCouplerFixture,
  STUDENT_MISTAKE_GALLERY,
  strayLinkFixture,
  twoInputsFixture,
  weldedCouplerPinFixture,
} from '../../test-utils/verification/student-mistake-fixtures';

/**
 * What the setup drawer says about each mistake the student-mistakes sweep
 * taught it to name, word for word, and that doing what it says makes the
 * drawing run. The sweep measures the advice over hundreds of drawings; this
 * pins the sentences, one drawing each, where a reviewer can read them.
 */
describe('what the drawer says about a mistake it has learned to name', () => {
  /** Every check of every machine, then what is in no machine at all. */
  function said(fixture: MechanismFixture) {
    const { machines, stray } = readDrawing(fixture);
    return {
      checks: machines.flatMap(({ readiness }) => readiness.checks),
      ready: machines.map(({ readiness }) => readiness.ready),
      stray,
    };
  }

  it('offers to unweld a pin welded by mistake', () => {
    const [check] = said(weldedCouplerPinFixture()).checks;
    expect(check.title).toBe('This mechanism has 0 degrees of freedom');
    expect(check.body).toBe(
      'It is over-constrained, so nothing can move at all. Unwelding joint C would leave one ' +
        'degree of freedom.'
    );
    expect(check.at?.id).toBe('C');
  });

  it('names two joints dropped beside each other, in both machines they made', () => {
    const { checks } = said(rockerBesideCouplerFixture());
    expect(checks.map((check) => check.title)).toEqual([
      'Joint E is not joined to joint C',
      'Joint E is not joined to joint C',
    ]);
    expect(checks[0].body).toBe(
      'The two are drawn almost on top of each other, so they look like one joint, but the ' +
        'links on each are not connected. Dragging joint E onto joint C would join the two ' +
        'into one.'
    );
    expect(checks[0].at?.id).toBe('E');
  });

  it('names a link hanging from a pivot, and lets the machine beside it run', () => {
    const { checks, ready } = said(linkHangingFromPivotFixture());
    expect(ready).toEqual([true, false]);
    expect(checks[0].title).toBe('Link DE hangs from joint D and nothing else');
    expect(checks[0].body).toBe(
      'It turns freely about joint D, joined to nothing that moves, so it is a mechanism of ' +
        'its own with nothing to drive it. Delete it, or attach its free end to the rest of ' +
        'the linkage.'
    );
    expect(checks[0].action).toBe('Go To Link');
  });

  it('names the links on an input pivot, and the one to take off it', () => {
    const [check] = said(braceAtInputFixture()).checks;
    expect(check.title).toBe('The input at joint A has more than one link to turn');
    expect(check.body).toBe(
      'Joint A holds links AB and AC to the ground, so the input would not say which one to ' +
        'turn. Deleting link AC would leave one degree of freedom.'
    );
    expect(check.at?.id).toBe('AC');
  });

  it('warns that a second input is ignored, and runs from the first', () => {
    const { checks, ready } = said(twoInputsFixture());
    expect(ready).toEqual([true]);
    expect(checks.map((check) => [check.state, check.title])).toEqual([
      ['warning', 'Joints A and D are both set as the input'],
    ]);
    expect(checks[0].body).toBe(
      'One input drives one degree of freedom, so this mechanism runs from joint A and ignores ' +
        'the other. Remove the input from joint D so the drawing says what runs.'
    );
  });

  it('names a stray link, and runs the mechanism beside it', () => {
    const { ready, stray } = said(strayLinkFixture());
    expect(ready).toEqual([true]);
    expect(stray.map((report) => report.title)).toEqual(['Link EF is attached to nothing']);
  });

  it('ungrounds the joint that split a six-bar in two, counted on both halves', () => {
    // Ungrounding D also counts one on the half that holds it, and leaves the
    // other half rigid: it is not offered.
    const { checks } = said(groundedWattJointFixture());
    expect(checks.map((check) => check.body)).toEqual([
      'It is over-constrained, so nothing can move at all. Ungrounding joint E would leave one ' +
        'degree of freedom.',
      'It is over-constrained, so nothing can move at all. Ungrounding joint E would leave one ' +
        'degree of freedom.',
    ]);
  });

  it('joins a free end to the pivot its deleted link left behind', () => {
    const [check] = said(deletedRockerFixture()).checks;
    expect(check.body).toBe(
      'With the input held still, link BC can still move, so the input alone cannot say where ' +
        'it goes. Attaching a link from joint C to joint D or deleting link BC would each leave ' +
        'one degree of freedom.'
    );
  });

  it('runs with the frame drawn as a bar between its pivots', () => {
    const { checks, ready } = said(frameBarFixture());
    expect(ready).toEqual([true]);
    expect(checks).toEqual([]);
  });

  it('says which joint can take an input set on a coupler point', () => {
    const [check] = said(inputOnCouplerPointFixture()).checks;
    expect(check.body).toBe(
      'An input joint needs two bodies to move relative to each other. Set the input on joint ' +
        'A instead.'
    );
  });

  it('runs once the drawer is done with it, every one', () => {
    for (const entry of STUDENT_MISTAKE_GALLERY) {
      const walk = followAdvice({
        seed: 0,
        base: entry.name,
        intended: entry.fixture,
        broken: entry.fixture,
        mistakes: [],
      });
      expect(`${entry.name}: ${walk.outcome}`).toBe(
        `${entry.name}: ${entry.runs && walk.steps.length === 0 ? 'runs as drawn' : 'runs'}`
      );
    }
  });
});
