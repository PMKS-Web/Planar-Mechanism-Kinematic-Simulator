// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { PositionSolver } from '../../app/model/mechanism/position-solver';
import { ram } from '../../test-utils/cylinder-graph';

/**
 * A sample the solver refuses must leave nothing of itself behind.
 *
 * Putting the joint positions back is the obvious half and was the only half.
 * The solver also carries *continuation* state between samples: where the
 * moving boundary stood, and which commanded spans it has already solved. The
 * next sample walks the interval from that boundary to the next one and picks
 * its assembly branch along the way — so a boundary left at a sample the
 * validators went on to reject describes a pose the joints are not standing
 * at, and the branch that follows is chosen from somewhere the drawing has
 * never been.
 *
 * That became reachable when travel validation was extended to every cylinder:
 * a passive ram can now refuse a sample that solved perfectly well, after the
 * boundary has already been advanced to it.
 *
 * Driven at the solver rather than through a drawing on purpose. The routing
 * that would produce this mechanism end to end is not built yet, and the
 * invariant — a refusal is a no-op — is worth pinning before it is.
 */
describe('a sample the solver turns away', () => {
  /** Everything that has to be the same afterwards as it was before. */
  function snapshot(solver: {
    jointMapPositions: Map<string, number[]>;
    priorJointPositions: Map<string, number[]>;
    boundaryPose?: Map<string, number[]>;
    solvedPoses: { span: number; pose: Map<string, number[]> }[];
  }) {
    const copy = (map?: Map<string, number[]>) =>
      map ? [...map].map(([id, at]) => [id, [...at]] as const).sort() : undefined;
    return JSON.stringify({
      positions: copy(solver.jointMapPositions),
      prior: copy(solver.priorJointPositions),
      boundary: copy(solver.boundaryPose),
      solved: solver.solvedPoses.map((entry) => ({ span: entry.span, pose: copy(entry.pose) })),
    });
  }

  /**
   * A ram whose two mounts are the moving boundary, with the far one already
   * carried out to twice its span: the constraint set solves, and the travel
   * check refuses the result because the rod has left the barrel.
   */
  function refusedByTravel() {
    const solver = PositionSolver as unknown as Record<string, unknown> & {
      jointMapPositions: Map<string, number[]>;
      priorJointPositions: Map<string, number[]>;
      boundaryPose?: Map<string, number[]>;
      solvedPoses: { span: number; pose: Map<string, number[]> }[];
      determinePositionAnalysis: (...args: unknown[]) => boolean;
      registerSealedCylinders: (joints: unknown) => unknown;
      resetStaticVariables: () => void;
      jointNumOrderSolverMap: Map<number, string[]>;
      desiredConnectedJointIndicesMap: Map<string, number[]>;
      desiredAnalysisJointMap: Map<string, string>;
    };
    solver.resetStaticVariables();
    const parts = ram();
    solver.registerSealedCylinders(parts.joints);

    const barrel = parts.barrelNear.x;
    const rod = parts.rodFar.x - parts.pin.x;
    (solver as Record<string, unknown>)['simultaneousSystem'] = {
      unknownIds: ['B', 'C', 'P'],
      constraints: [
        { kind: 'distance', a: 'A', b: 'B', length: barrel },
        { kind: 'onFixedLine', point: 'B', at: [0, 0], dir: [1, 0] },
        { kind: 'distance', a: 'C', b: 'D', length: rod },
        { kind: 'onFixedLine', point: 'C', at: [0, 0], dir: [1, 0] },
        { kind: 'coincident', a: 'C', b: 'P' },
      ],
    };
    (solver as Record<string, unknown>)['boundaryIds'] = ['A', 'D'];
    solver.boundaryPose = new Map([
      ['A', [0, 0]],
      ['D', [10, 0]],
    ]);
    (solver as Record<string, unknown>)['boundaryScale'] = 10;
    solver.jointMapPositions = new Map(parts.joints.map((joint) => [joint.id, [joint.x, joint.y]]));
    // The mount the rest of the mechanism has carried, well past what the ram
    // can reach.
    solver.jointMapPositions.set('D', [20, 0]);
    (solver as Record<string, unknown>)['stepCount'] = 1;
    solver.jointNumOrderSolverMap.set(1, ['B', 'C', 'P']);
    solver.desiredConnectedJointIndicesMap.set('B', []);
    solver.desiredAnalysisJointMap.set('B', 'simultaneousSystem');
    return { solver, parts };
  }

  it('is refused, and leaves the solver exactly as it found it', () => {
    const { solver, parts } = refusedByTravel();
    const before = snapshot(solver);

    expect(solver.determinePositionAnalysis(parts.joints, parts.links, [], true)).toBe(false);

    // Not only the joint positions: the boundary the next sample would
    // interpolate from, and the spans this one had already recorded answers
    // for, are part of the same undo.
    expect(snapshot(solver)).toBe(before);
    solver.resetStaticVariables();
  });

  it('leaves the moving boundary where the last accepted sample put it', () => {
    // Stated on its own, because this is the field the travel check reached
    // past: `boundaryDriven` writes it before any validator has had a say.
    const { solver, parts } = refusedByTravel();
    const boundary = new Map(solver.boundaryPose);

    solver.determinePositionAnalysis(parts.joints, parts.links, [], true);

    expect(solver.boundaryPose).toEqual(boundary);
    expect(solver.boundaryPose?.get('D')).toEqual([10, 0]);
    solver.resetStaticVariables();
  });

  it('puts the remembered spans back too, when a pose is restored', () => {
    // `reachSpan` files each commanded span's answer away to be recalled on
    // the way back, and a rejected sample that left its answer there would
    // hand the reversal a pose the mechanism was never allowed to be in. The
    // scenario above is boundary-driven and files nothing, so this asks the
    // capture/restore pair the question directly — it is the same undo both
    // paths go through.
    const solver = PositionSolver as unknown as {
      solvedPoses: { span: number; pose: Map<string, number[]> }[];
      capturePose: () => unknown;
      restorePose: (pose: unknown) => void;
      resetStaticVariables: () => void;
    };
    solver.resetStaticVariables();
    solver.solvedPoses = [{ span: 4, pose: new Map([['C', [1, 2]]]) }];

    const held = solver.capturePose();
    solver.solvedPoses.push({ span: 5, pose: new Map([['C', [9, 9]]]) });
    solver.restorePose(held);

    expect(solver.solvedPoses.map((entry) => entry.span)).toEqual([4]);
    solver.resetStaticVariables();
  });
});
