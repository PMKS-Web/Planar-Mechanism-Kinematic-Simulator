// joint.ts first: see the import-cycle note in fixture.ts.
import '../../app/model/joint';
import { ForceSolver } from '../../app/model/mechanism/force-solver';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { PositionSolver } from '../../app/model/mechanism/position-solver';
import { buildDrawing, buildMechanism } from '../../test-utils/verification/fixture';
import { FIXTURE_GALLERY } from '../../test-utils/verification/fixture-gallery';
import { fixturePayload } from '../../test-utils/verification/fixture-payload';

/**
 * The numerical oracle is exported from a drawing that has never been solved
 * (docs/numerical-oracle-plan.md, "Identical physical inputs"). An export that
 * solved first could carry PMKS+'s own answer -- a settled pose, a re-derived
 * center of mass -- into the problem the oracle is supposed to check it with.
 * So every solver entry point is made to throw while a drawing is built and
 * encoded, and any path that reaches one fails here.
 */
describe('the oracle export boundary', () => {
  // Counted rather than made to throw: `Mechanism` catches a solver's error and
  // reports the drawing unsolvable, so a throwing spy would be swallowed.
  const spies = () => [
    vi.spyOn(PositionSolver, 'resetStaticVariables'),
    vi.spyOn(PositionSolver, 'determineJointOrder'),
    vi.spyOn(KinematicsSolver, 'determineKinematics'),
    vi.spyOn(ForceSolver, 'analyzeMechanism'),
  ];
  const calls = (watched: ReturnType<typeof spies>) =>
    watched.reduce((sum, spy) => sum + spy.mock.calls.length, 0);

  afterEach(() => vi.restoreAllMocks());

  it('builds every gallery drawing without solving it', () => {
    const watched = spies();
    FIXTURE_GALLERY.forEach((entry) => buildDrawing(entry.fixture));
    expect(calls(watched)).toBe(0);
  });

  it('encodes every gallery drawing without solving it', () => {
    const watched = spies();
    FIXTURE_GALLERY.forEach((entry) =>
      fixturePayload(entry.fixture, entry.objectScale, entry.speed)
    );
    expect(calls(watched)).toBe(0);
  });

  // Without this the two above would also pass if the spies watched nothing.
  it('would notice a build that does solve', () => {
    const watched = spies();
    buildMechanism(FIXTURE_GALLERY[0].fixture);
    expect(calls(watched)).toBeGreaterThan(0);
  });
});
