// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { followAdvice, readDrawing } from '../../test-utils/verification/follow-advice';
import { read } from '../../test-utils/verification/issue-text';
import { plateGroundedEverywhereFixture } from '../../test-utils/verification/mobility-fixtures';
import { partitionMechanisms } from '../../app/model/mechanism/mechanism-partition';
import { unassignedIssues } from '../../app/model/mechanism/unassigned-issues';
import {
  braceAtInputFixture,
  bracedScotchYokeFixture,
  couplerInputAndHangingLinkFixture,
  crankLockedAtASlotPinFixture,
  deletedRockerFixture,
  frameBarFixture,
  groundedKneeLeftUnweldedFixture,
  groundedWattJointFixture,
  hangingLinkNoInputFixture,
  inputOnCouplerPointFixture,
  inputOnTheWeldedKneeFixture,
  linkHangingFromPivotFixture,
  lockedRockerBesideCouplerFixture,
  missingCouplerFixture,
  rockerBesideCouplerFixture,
  rockerOnTheCouplerPinFixture,
  secondCrankOnTheInputFixture,
  rodShortOfTheCrankPinFixture,
  sixBarLinkHungBesideAJointFixture,
  STUDENT_MISTAKE_GALLERY,
  strayLinkFixture,
  plateHeldByAGroundedLinkFixture,
  plateWithTwoHangingLinksFixture,
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
  /** What is said about the frame and the loose geometry, which belongs to no machine. */
  function unassignedOf(fixture: MechanismFixture) {
    const { drawing } = readDrawing(fixture);
    const { unassigned } = partitionMechanisms(drawing.joints, drawing.links, []);
    return unassignedIssues(unassigned, drawing.joints).map(read);
  }

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
      "Joint E sits almost on top of joint C, but they're two joints."
    );
    expect(issues[0].fixes).toEqual(['Drag joint E onto joint C']);
  });

  it('counts a link hanging from a pivot as part of the linkage on that pivot', () => {
    // One machine, not a four-bar and a link beside it: a reader who hangs a
    // link off a pivot the linkage uses has drawn one thing, and it does not run.
    const { issues, ready } = said(linkHangingFromPivotFixture());
    expect(ready).toEqual([false]);
    expect(issues[0].title).toBe('2 degrees of freedom, needs 1');
    expect(issues[0].summary).toBe('With the input held still, link DE can still move.');
    expect(issues[0].fixes).toEqual(['Delete link DE', 'Set joint D to Welded', 'Ground joint E']);
  });

  it('does not run a drawing whose input pivot joins three bodies', () => {
    // The solver used to pick one pair and play it, under a drawer that said
    // the input could not be one.
    const { machines } = readDrawing(secondCrankOnTheInputFixture());
    expect(machines.map(({ readiness }) => readiness.ready)).toEqual([false]);
    expect(machines[0].readiness.checks.map(read)[0].title).toBe("Joint A can't be the input");
    const built = buildMechanism(secondCrankOnTheInputFixture());
    const { mechanisms } = partitionMechanisms(built.joints, built.links, []);
    const solved = new Mechanism(mechanisms[0].joints, mechanisms[0].links, [], [], false, 'cm', 1);
    expect(solved.isMechanismValid()).toBe(false);
    expect(solved.failure).toBe('input-refused');
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

  it('ungrounds the joint that split a six-bar in two', () => {
    // The halves share the grounded joint, so they are one machine and hear
    // one sentence, not the same sentence twice.
    const { issues } = said(groundedWattJointFixture());
    expect(issues.map((issue) => [issue.title, issue.fixes])).toEqual([
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
    // B Prismatic counts as well, but B rides a slot in the moving yoke, and
    // the solver refuses a Prismatic joint on a moving carrier; it is not
    // offered.
    expect(issue.fixes).toEqual(['Set joint C to Prismatic']);
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

  it('says what each loose link needs, where no single edit is enough', () => {
    const [issue] = said(plateWithTwoHangingLinksFixture()).issues;
    expect(issue.title).toBe('3 degrees of freedom, needs 1');
    expect(issue.summary).toBe('With the input held still, link AB and link FG can still move.');
    expect(issue.explain).toContain('make one, and this list updates');
    // Every way out for each, the two for one link together: deleting it, or
    // holding its free end to ground.
    expect(issue.fixes).toEqual([
      'Delete link AB',
      'Attach Link at joint A, then ground its far end',
      'Delete link FG',
      'Attach Link at joint G, then ground its far end',
    ]);
  });

  it('names what frees a stuck input, though a loose link will still need its own fix', () => {
    const [issue] = said(plateHeldByAGroundedLinkFixture()).issues;
    expect(issue.title).toBe("Input at joint D can't turn");
    expect(issue.summary).toBe('Link BDF and link FG are locked in place by the ground.');
    // Neither leaves exactly one freedom, because AB still hangs loose -- the
    // next issue, once the input can turn. The parts are named, not described.
    expect(issue.fixes).toEqual(['Turn off Grounded for joint G', 'Delete link FG']);
  });

  it('says a crank locked by a grounded link at a slot pin cannot turn, not that it is at a limit', () => {
    const [issue] = said(crankLockedAtASlotPinFixture()).issues;
    expect(issue.title).toBe("Input at joint H can't turn");
    expect(issue.summary).toBe('Link HI and link IJ are locked in place by the ground.');
    expect(issue.fixes).toEqual(['Turn off Grounded for joint J', 'Delete link IJ']);
  });

  it('counts a link hung beside a joint with the linkage, and does not brace it there', () => {
    // H sits a hair from F, but joining them braces the six-bar rigid: the
    // merge is counted on the whole machine, and it is not offered.
    const { issues, ready } = said(sixBarLinkHungBesideAJointFixture());
    expect(ready).toEqual([false]);
    expect(issues[0].summary).toBe('With the input held still, link DH can still move.');
    expect(issues[0].fixes).toEqual(['Delete link DH', 'Set joint D to Welded', 'Ground joint H']);
  });

  it('joins a rod dropped short of the crank pin, rather than giving it a slider of its own', () => {
    const { issues, ready } = said(rodShortOfTheCrankPinFixture());
    expect(ready).toEqual([true, false]);
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toBe("Joint D isn't joined to joint B");
    expect(issues[0].summary).toBe("Joint D stops just short of joint B, so they're two joints.");
    expect(issues[0].fixes).toEqual(['Drag joint D onto joint B']);
  });

  it('draws the missing coupler first, and only then offers the rocker its own input', () => {
    const { issues } = said(missingCouplerFixture());
    expect(issues.map((issue) => issue.title)).toEqual(["Link CD isn't joined to link AB"]);
    expect(issues[0].summary).toBe("Nothing joins link CD to link AB, so they're two mechanisms.");
    expect(issues[0].fixes).toEqual([
      'Attach Link from joint C to joint B',
      'Add Input to joint D',
    ]);
  });

  it('names two joints drawn exactly on top of each other', () => {
    const { issues } = said(rockerOnTheCouplerPinFixture());
    expect(issues.map((issue) => issue.fixes)).toEqual([
      ['Drag joint E onto joint C'],
      ['Drag joint E onto joint C'],
    ]);
  });

  it('drags the joint that is not locked onto the one that is', () => {
    const { issues } = said(lockedRockerBesideCouplerFixture());
    expect(issues[0].title).toBe("Joint C isn't joined to joint E");
    expect(issues[0].fixes).toEqual(['Drag joint C onto joint E']);
  });

  it('deletes a brace across a Scotch yoke before freeing a guide that starts at a limit', () => {
    // Pin-in-slot at C counts one too, but the yoke then starts at a limit: it
    // is listed after the edit that leaves the drawing ready to play.
    const [issue] = said(bracedScotchYokeFixture()).issues;
    expect(issue.title).toBe("Over-constrained, can't move");
    expect(issue.fixes).toEqual(['Delete link BD', 'Set joint C to Pin-in-slot']);
  });

  it('moves an input off a welded knee, and does not unweld a knee that counts two', () => {
    const [issue] = said(inputOnTheWeldedKneeFixture()).issues;
    expect(issue.title).toBe("Joint C can't be the input");
    expect(issue.fixes).toEqual(['Add Input to joint A']);
  });

  it('names both edits where a knee was grounded and its weld left off', () => {
    const [issue] = said(groundedKneeLeftUnweldedFixture()).issues;
    expect(issue.title).toBe("Over-constrained, can't move");
    expect(issue.fixes[0]).toBe('Turn off Grounded for joint C, then set joint C to Welded');
  });

  it('lets a plate grounded at every joint turn by leaving it one support', () => {
    const [issue] = unassignedOf(plateGroundedEverywhereFixture());
    expect(issue.title).toBe('Link ABC is grounded at every joint');
    expect(issue.fixes).toEqual(['Turn off Grounded for joint A and joint B']);
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
