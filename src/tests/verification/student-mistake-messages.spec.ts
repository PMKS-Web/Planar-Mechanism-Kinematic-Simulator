// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { MechanismFixture } from '../../test-utils/verification/fixture';
import { followAdvice, readDrawing } from '../../test-utils/verification/follow-advice';
import { read } from '../../test-utils/verification/issue-text';
import {
  braceAtInputFixture,
  couplerInputAndHangingLinkFixture,
  deletedRockerFixture,
  frameBarFixture,
  groundedWattJointFixture,
  hangingLinkNoInputFixture,
  inputOnCouplerPointFixture,
  linkHangingFromPivotFixture,
  rockerBesideCouplerFixture,
  STUDENT_MISTAKE_GALLERY,
  strayLinkFixture,
  twoInputsFixture,
  unweldedKneeFixture,
  weldedCouplerPinFixture,
  yokeOnPinInSlotFixture,
} from '../../test-utils/verification/student-mistake-fixtures';

/**
 * What the setup drawer says about each mistake the student-mistakes sweep
 * taught it to name, word for word, and that doing what it says makes the
 * drawing run. The sweep measures the advice over hundreds of drawings; this
 * pins the words, one drawing each, where a reviewer can read them.
 */
describe('what the drawer says about a mistake it has learned to name', () => {
  /** Every issue of every machine, as read, then what is in no machine at all. */
  function said(fixture: MechanismFixture) {
    const { machines, stray } = readDrawing(fixture);
    return {
      issues: machines.flatMap(({ readiness }) => readiness.checks.map(read)),
      ready: machines.map(({ readiness }) => readiness.ready),
      stray: stray.map(read),
    };
  }

  it('offers to unweld a pin welded by mistake', () => {
    const [issue] = said(weldedCouplerPinFixture()).issues;
    expect(issue.title).toBe("Over-constrained, can't move");
    expect(issue.summary).toBe('The count comes to 0 degrees of freedom, so nothing can move.');
    expect(issue.fixes).toEqual(['Set joint C to Revolute']);
    expect(issue.parts).toEqual(['C']);
  });

  it('names two joints dropped beside each other, in both machines they made', () => {
    const { issues } = said(rockerBesideCouplerFixture());
    expect(issues.map((issue) => issue.title)).toEqual([
      "Joint E isn't joined to joint C",
      "Joint E isn't joined to joint C",
    ]);
    expect(issues[0].summary).toBe(
      "joint E sits almost on top of joint C, but they're two joints."
    );
    expect(issues[0].fixes).toEqual(['Drag joint E onto joint C']);
  });

  it('names a link hanging from a pivot, and lets the machine beside it run', () => {
    const { issues, ready } = said(linkHangingFromPivotFixture());
    expect(ready).toEqual([true, false]);
    expect(issues[0].title).toBe('Link DE hangs from joint D');
    expect(issues[0].summary).toBe(
      'link DE turns freely about joint D, joined to nothing else that moves.'
    );
    expect(issues[0].fixes).toEqual([
      'Delete link DE',
      'Drag joint E onto the joint it should hold',
    ]);
  });

  it('names the links on an input pivot, and the one to take off it', () => {
    const [issue] = said(braceAtInputFixture()).issues;
    expect(issue.title).toBe('Joint A has 2 links to turn');
    expect(issue.summary).toBe("The input can't tell whether to turn link AB or link AC.");
    expect(issue.fixes).toEqual(['Delete link AC']);
  });

  it('warns that a second input is ignored, and runs from the first', () => {
    const { issues, ready } = said(twoInputsFixture());
    expect(ready).toEqual([true]);
    expect(issues.map((issue) => [issue.severity, issue.title])).toEqual([
      ['warning', 'Two joints are set as the input'],
    ]);
    expect(issues[0].summary).toBe('The mechanism runs from joint A and ignores joint D.');
    expect(issues[0].fixes).toEqual(['Remove Input from joint D']);
  });

  it('names a stray link, and runs the mechanism beside it', () => {
    const { ready, stray } = said(strayLinkFixture());
    expect(ready).toEqual([true]);
    expect(stray.map((issue) => [issue.severity, issue.title])).toEqual([
      ['unassigned', 'Link EF is attached to nothing'],
    ]);
    expect(stray[0].fixes).toEqual(['Ground joint E', 'Delete link EF']);
  });

  it('ungrounds the joint that split a six-bar in two, counted on both halves', () => {
    // Ungrounding D also counts one on the half that holds it, and leaves the
    // other half rigid: it is not offered. The half with no input of its own
    // is not asked for one: its input is on the other half.
    const { issues } = said(groundedWattJointFixture());
    expect(issues.map((issue) => [issue.title, issue.fixes])).toEqual([
      ["Over-constrained, can't move", ['Turn off Grounded for joint E']],
      ["Over-constrained, can't move", ['Turn off Grounded for joint E']],
    ]);
  });

  it('joins a free end to the pivot its deleted link left behind', () => {
    const [issue] = said(deletedRockerFixture()).issues;
    expect(issue.title).toBe('2 degrees of freedom, needs 1');
    expect(issue.summary).toBe('With the input held still, link BC can still move.');
    // Joining C to the pivot left behind first: it is the drawing that was
    // there. Deleting BC is listed too, and welding it to the crank as an arm;
    // a new pivot is not, with an old one standing right there to join.
    expect(issue.fixes).toEqual([
      'Attach Link from joint C to joint D',
      'Delete link BC',
      'Set joint B to Welded',
    ]);
  });

  it('runs with the frame drawn as a bar between its pivots', () => {
    const { issues, ready } = said(frameBarFixture());
    expect(ready).toEqual([true]);
    expect(issues).toEqual([]);
  });

  it('says which joint can take an input set on a coupler point', () => {
    const [issue] = said(inputOnCouplerPointFixture()).issues;
    expect(issue.title).toBe("Joint E can't be the input");
    expect(issue.summary).toBe(
      'Only one link meets at joint E, so it has nothing to turn against.'
    );
    expect(issue.fixes).toEqual(['Add Input to joint A']);
  });

  it('welds a bent coupler at its knee, before anything that changes another link', () => {
    const [issue] = said(unweldedKneeFixture()).issues;
    expect(issue.title).toBe('2 degrees of freedom, needs 1');
    // Welding B or E counts too, and so does grounding E, but each changes a
    // link the reader drew to turn about a pivot: they are listed after C, and
    // the list stops at three.
    expect(issue.fixes).toEqual([
      'Set joint C to Welded',
      'Set joint E to Welded',
      'Ground joint E',
    ]);
  });

  it("makes a Scotch yoke's guide Prismatic, so the yoke slides without turning", () => {
    const [issue] = said(yokeOnPinInSlotFixture()).issues;
    expect(issue.summary).toBe('With the input held still, link CD can still move.');
    // B Prismatic counts as well, and locks the crank to the yoke's angle.
    expect(issue.fixes).toEqual(['Set joint C to Prismatic', 'Set joint B to Prismatic']);
  });

  it('says a count that is wrong and an input that is missing together', () => {
    // The solver stops at the count, and used to say only that; the input was
    // asked for once the count was fixed.
    const { issues } = said(hangingLinkNoInputFixture());
    expect(issues.map((issue) => issue.title)).toEqual([
      '2 degrees of freedom, needs 1',
      'No input is set',
    ]);
    // With no input to hold, a fix has to leave a freedom some joint could
    // drive: grounding B, or welding it, leaves one -- the hanging link's.
    expect(issues[0].fixes).toEqual([
      'Delete link CE',
      'Attach Link at joint E, then ground its far end',
    ]);
    expect(issues[1].fixes).toEqual(['Add Input to joint A']);
  });

  it('says an input that cannot be one beside the count, which is not its doing', () => {
    const { issues } = said(couplerInputAndHangingLinkFixture());
    expect(issues.map((issue) => issue.title)).toEqual([
      "Joint E can't be the input",
      '2 degrees of freedom, needs 1',
    ]);
    // Not "with the input held still": this one cannot be held.
    expect(issues[1].summary).toBe('The mechanism can move in 2 independent ways.');
    expect(issues[1].fixes).toEqual([
      'Delete link CF',
      'Attach Link at joint F, then ground its far end',
    ]);
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
