// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import {
  axialCarriageFixture,
  obliqueGuideFixture,
  pinnedBoomFixture,
  rotatingCarrierFixture,
  translatingBracketFixture,
  weldedBoomFixture,
} from '../../test-utils/verification/coupled-mount-fixtures';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { assignBodies, WORLD } from '../../app/model/mechanism/bodies';

/**
 * Which links are one body, and how many freedoms that leaves.
 *
 * Nothing cylinder-specific is added to either count -- a mount weld makes one
 * RealLink root like any other weld, an external Slide fuses that root with
 * its block, and the internal Slide fuses rod and block. Adding the same
 * bodies again in a cylinder branch would subtract the same constraints twice.
 * So what is asserted is that the general rules land on the answer a reader
 * would get by hand, on drawings the general rules had never been shown.
 *
 * Every expectation below is written out from the drawing, not read off a run.
 */

const SCALE = MODEL_SCALE;

interface Counted {
  name: string;
  make: (scale: number) => MechanismFixture;
  /** Groups of link ids that must come out as one body each. */
  bodies: string[][];
  /** Links that are the world: pinned down at every joint. */
  world: string[];
  /** Bodies that can move, counted by hand from the groups above. */
  moving: number;
  /** Degrees of freedom, counted by hand. */
  dof: number;
}

const CASES: Counted[] = [
  {
    // Barrel on its own; rod and the ram's own block welded at the pin; the
    // carriage's block on its own, because its mount is not welded to it.
    name: 'a carriage on the ram’s own axis',
    make: axialCarriageFixture,
    bodies: [['ON'], ['PR', 'PS'], ['OK']],
    world: [],
    moving: 3,
    // Three moving bodies against four lower pairs -- the mount pin, the ram's
    // slider, the rod's ground pin and the carriage's guide: 3(3) - 2(4) = 1.
    dof: 1,
  },
  {
    name: 'a carriage on a guide that runs across the ram',
    make: obliqueGuideFixture,
    bodies: [['ON'], ['PR', 'PS'], ['OK']],
    world: [],
    moving: 3,
    dof: 1,
  },
  {
    // The bracket is welded to its guide's block, so compound and block are
    // one body; the rod is welded to the ram's block as always.
    name: 'a bracket that translates, carrying a passive ram',
    make: translatingBracketFixture,
    bodies: [
      ['ONW', 'WK'],
      ['PR', 'PS'],
    ],
    world: [],
    moving: 2,
    // Two moving bodies against three lower pairs -- the drive's guide, the
    // ram's slider and the rod's ground pin -- is 3(2) - 2(3) = 0, and the
    // drawing plainly moves. The count is wrong because the rod's ground pin
    // sits on the barrel's own axis, so one of the four constraints on the rod
    // repeats another; the geometry is asked and answers one.
    dof: 1,
  },
  {
    // The mount is welded to the crank's block, so barrel and that block are
    // one body -- and the crank bar itself is not part of it: the block rides
    // the crank, it is not fused to it.
    name: 'a mount riding a slot cut into a turning crank',
    make: rotatingCarrierFixture,
    bodies: [['AE'], ['ON', 'OQ'], ['PR', 'PS']],
    world: [],
    moving: 3,
    // Three moving bodies against four lower pairs: the crank's ground pin,
    // the crank's slot, the ram's slider and the rod's ground pin.
    dof: 1,
  },
  {
    // The rod is welded into the bracket, and the ram's own weld fuses that
    // whole compound with the ram's block.
    name: 'a boom whose rod mount is welded into a bracket',
    make: weldedBoomFixture,
    bodies: [['OC'], ['GN'], ['PCW', 'PS']],
    world: [],
    moving: 3,
    // Three moving bodies against four lower pairs: the boom's ground pin, the
    // barrel's ground pin, the ram's slider and the pin joining boom to
    // bracket.
    dof: 1,
  },
  {
    // The boom pinned at both ends is the world, and everything else is held
    // against it.
    name: 'the same boom with its tip pinned down',
    make: pinnedBoomFixture,
    bodies: [['GN'], ['PCW', 'PS']],
    world: ['OC'],
    moving: 2,
    // Two moving bodies against four lower pairs -- the barrel's ground pin,
    // the ram's slider, and the bracket's pin at a tip that is now ground:
    // 3(2) - 2(3) = 0, and nothing about the geometry rescues it, because
    // nothing can move.
    dof: 0,
  },
];

describe('the bodies a mount weld makes, and the freedoms they leave', () => {
  for (const example of CASES) {
    describe(example.name, () => {
      const built = buildMechanism(example.make(SCALE));
      const assignment = assignBodies(built.joints, built.links);

      it('fuses exactly the links a reader would fuse', () => {
        for (const group of example.bodies) {
          const ids = group.map((id) => built.links.find((link) => link.id === id));
          expect(ids.every(Boolean), `links ${group.join(', ')} exist`).toBe(true);
          const bodies = new Set(ids.map((link) => assignment.bodyOf(link!)));
          expect(bodies.size, `${group.join(' + ')} are one body`).toBe(1);
          expect([...bodies][0], `${group.join(' + ')} are not the world`).not.toBe(WORLD);
        }
        // And no two groups share one: the count below is only meaningful if
        // these are actually distinct.
        const representatives = example.bodies.map((group) =>
          assignment.bodyOf(built.links.find((link) => link.id === group[0])!)
        );
        expect(new Set(representatives).size).toBe(example.bodies.length);
      });

      it('leaves the world holding what is pinned down everywhere', () => {
        for (const id of example.world) {
          const link = built.links.find((candidate) => candidate.id === id);
          expect(link, `link ${id} exists`).toBeDefined();
          expect(assignment.bodyOf(link!)).toBe(WORLD);
        }
        expect(assignment.movingBodies.size).toBe(example.moving);
      });

      it('counts the degrees of freedom a reader counts', () => {
        // The number the build settled on, not a fresh count: a mechanism that
        // cannot move has had its frames cleared by then, and counting again
        // over no frames finds no ground and answers NaN.
        expect(built.mechanism.dof).toBe(example.dof);
      });

      it('runs, or says honestly that it cannot', () => {
        expect(built.mechanism.isMechanismValid()).toBe(example.dof === 1);
        if (example.dof !== 1) {
          expect(built.mechanism.failure).toBe('mobility');
        }
      });
    });
  }
});
