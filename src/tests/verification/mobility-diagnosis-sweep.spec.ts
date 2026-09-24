// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { describeActuator } from '../../app/model/actuator';
import { cylindersIn } from '../../app/model/cylinder';
import { Joint, PrisJoint, RealJoint } from '../../app/model/joint';
import { Link, RealLink } from '../../app/model/link';
import { diagnoseMobility, MobilityFix } from '../../app/model/mechanism/free-motion';
import { assignBodies, WORLD } from '../../app/model/mechanism/bodies';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import {
  MechanismPartition,
  partitionMechanisms,
} from '../../app/model/mechanism/mechanism-partition';
import { readinessOf } from '../../app/model/mechanism/readiness';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { MechanismService } from '../../app/services/mechanism.service';
import { SettingsService } from '../../app/services/settings.service';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import {
  TEMPLATE_IDS,
  TEMPLATE_LINKAGES,
} from '../../app/component/MODALS/templates/template-linkages';

/**
 * Every library drawing, broken one way at a time, and what readiness says.
 *
 * The hand-built drawings in `mobility-diagnosis.spec.ts` each have one right
 * answer; this asks the questions that have to hold for *every* drawing, on the
 * shapes a student actually makes out of a working one: a joint grounded that
 * should not be, a ground taken away, a link deleted, the input set on the
 * wrong joint. Each machine is built the
 * way `MechanismService` builds it -- one `Mechanism` per partition, handed the
 * joints it owns -- because that, not a single mechanism over the whole drawing,
 * is where "No input is set" was once said beside an input's own arrow.
 *
 * What must hold:
 * - nothing throws;
 * - "No input is set" is never said while an input joint sits in this machine
 *   and no other machine owns it -- an input on a link grounded at both ends is
 *   the drawing that was reported. An input a frame bar brings in from the
 *   machine next door is that machine's, and the sentence is true;
 * - every fix the diagnosis offers, made for real on a fresh copy, leaves the
 *   parts it was about as one machine at one degree of freedom -- not the right
 *   count split across a machine that runs and a rigid piece that cannot;
 * - no sentence names, and no button goes to, a joint a cylinder places for
 *   itself, and every button goes to something that is in the drawing.
 */
describe('readiness across every library drawing, broken one way at a time', () => {
  const settings = new SettingsService();

  interface Drawing {
    joints: Joint[];
    links: Link[];
    forces: [];
  }

  function decode(id: string): Drawing {
    const decoder = new StringTranscoder();
    decoder.decodeURL(TEMPLATE_LINKAGES[id as keyof typeof TEMPLATE_LINKAGES]);
    const target = {
      joints: [],
      links: [],
      forces: [],
      mechanismTimeStep: 0,
    } as unknown as MechanismService;
    new MechanismBuilder(target, decoder, settings, new ActiveObjService()).build(true, false);
    return { joints: target.joints, links: target.links, forces: [] };
  }

  /** One `Mechanism` per machine, as the service builds them. */
  function machines(drawing: Drawing) {
    const { mechanisms } = partitionMechanisms(drawing.joints, drawing.links, drawing.forces);
    return mechanisms.map((partition) => {
      const driven = partition.ownJoints.find(
        (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
      );
      const speed = driven?.driveSpeed || 10;
      const mechanism = new Mechanism(
        partition.joints,
        partition.links,
        partition.forces,
        [],
        false,
        'cm',
        driven instanceof PrisJoint ? speed * MODEL_SCALE : (speed * Math.PI) / 30,
        'adaptive',
        new Set(partition.ownJoints.map((joint) => joint.id))
      );
      const readiness = readinessOf(partition, mechanism, {
        cylinderName: (sliderId) => sliderId,
        drivenRefusal: (part) => {
          const input = part.ownJoints.find((joint) => joint instanceof RealJoint && joint.input);
          const refusal = input ? describeActuator(input) : undefined;
          return typeof refusal === 'string' ? refusal : undefined;
        },
        strokeWarning: () => undefined,
        describeSpeed: () => '10.00 RPM',
      });
      return { partition, mechanism, readiness };
    });
  }

  /** The edits a student makes out of a working drawing, one at a time. */
  function mutations(drawing: Drawing): { label: string; apply: (d: Drawing) => void }[] {
    const edits: { label: string; apply: (d: Drawing) => void }[] = [];
    for (const joint of drawing.joints) {
      if (!(joint instanceof RealJoint) || joint instanceof PrisJoint) continue;
      edits.push({
        label: `${joint.ground ? 'unground' : 'ground'} ${joint.id}`,
        apply: (d) => {
          const found = d.joints.find((one) => one.id === joint.id) as RealJoint;
          found.ground = !found.ground;
        },
      });
    }
    for (const link of drawing.links) {
      if (!(link instanceof RealLink)) continue;
      edits.push({ label: `delete ${link.id}`, apply: (d) => deleteLink(d, link.id) });
    }
    // Set straight on the model, past the menu that would refuse most of these:
    // a joint that was a fine input can be made a poor one by any later edit.
    // Not on a cylinder's buried inner end, which no reader can see to choose.
    const buried = new Set(cylindersIn(drawing.joints).map((cylinder) => cylinder.inner.id));
    for (const joint of drawing.joints) {
      if (!(joint instanceof RealJoint) || joint.input || buried.has(joint.id)) continue;
      edits.push({
        label: `input at ${joint.id}`,
        apply: (d) =>
          d.joints.forEach((one) => {
            if (one instanceof RealJoint) one.input = one.id === joint.id;
          }),
      });
    }
    return edits;
  }

  /** What `deleteLink` does to the model: the link goes, and so do joints nothing else holds. */
  function deleteLink(drawing: Drawing, id: string): void {
    const link = drawing.links.find((one) => one.id === id);
    if (!link) return;
    drawing.links.splice(drawing.links.indexOf(link), 1);
    for (const joint of link.joints) {
      if (!(joint instanceof RealJoint)) continue;
      joint.links = joint.links.filter((one) => one !== link);
      joint.connectedJoints = joint.connectedJoints.filter((one) => !link.joints.includes(one));
    }
    drawing.joints = drawing.joints.filter(
      (joint) => !(joint instanceof RealJoint) || joint.links.length > 0 || joint.ground
    );
  }

  function applyFix(drawing: Drawing, fix: MobilityFix): void {
    if (fix.kind === 'delete-link') {
      deleteLink(drawing, fix.link.id);
      return;
    }
    const joint = drawing.joints.find((one) => one.id === fix.joint.id) as RealJoint;
    if (fix.kind === 'ground') joint.ground = true;
    if (fix.kind === 'unground') joint.ground = false;
    if (fix.kind === 'pin-in-slot') (joint as PrisJoint).rotates = true;
  }

  const describeFix = (fix: MobilityFix): string =>
    fix.kind === 'delete-link' ? `delete ${fix.link.id}` : `${fix.kind} ${fix.joint.id}`;

  /**
   * The links of a machine that move: the ones no other machine can share, as
   * the frame bars it is handed are.
   */
  const movingLinks = (partition: MechanismPartition): string[] => {
    const { bodyOf } = assignBodies(partition.joints, partition.links);
    return partition.links.filter((link) => bodyOf(link) !== WORLD).map((link) => link.id);
  };

  const problems: string[] = [];
  let drawings = 0;
  let fixesChecked = 0;

  for (const id of TEMPLATE_IDS) {
    const base = decode(id);
    const cases: { label: string; apply: (d: Drawing) => void }[] = [
      { label: 'as drawn', apply: () => undefined },
      ...mutations(base),
    ];
    for (const edit of cases) {
      const where = `${id}, ${edit.label}`;
      try {
        const drawing = decode(id);
        edit.apply(drawing);
        drawings++;
        const built = machines(drawing);
        const owned = new Set(
          built.flatMap(({ partition }) => partition.ownJoints.map((j) => j.id))
        );
        const hidden = new Set(
          cylindersIn(drawing.joints).flatMap((cylinder) => [cylinder.inner.id])
        );

        const present = new Set([
          ...drawing.joints.map((joint) => joint.id),
          ...drawing.links.map((link) => link.id),
        ]);

        for (const { partition, readiness } of built) {
          for (const check of readiness.checks) {
            const said = `${check.title} ${check.body}`;
            if (check.title === 'No input is set') {
              const orphan = partition.joints.find(
                (joint) => joint instanceof RealJoint && joint.input && !owned.has(joint.id)
              );
              if (orphan) {
                problems.push(`${where}: "No input is set" beside input ${orphan.id}`);
              }
            }
            for (const buried of hidden) {
              if (new RegExp(`[Jj]oints? (?:[A-Z0-9]+, )*${buried}\\b`).test(said)) {
                problems.push(`${where}: names the cylinder's buried joint ${buried}: ${said}`);
              }
            }
            if (check.at && (hidden.has(check.at.id) || !present.has(check.at.id))) {
              problems.push(`${where}: "${check.title}" goes to ${check.at.id}`);
            }
            if (!check.title || !check.body) {
              problems.push(`${where}: a check with nothing to say: ${JSON.stringify(said)}`);
            }
          }
          if (
            !readiness.checks.some((check) =>
              /degrees of freedom|tied to nothing/.test(check.title)
            )
          ) {
            continue;
          }
          const before = new Set(movingLinks(partition));
          for (const fix of diagnoseMobility(partition).fixes) {
            fixesChecked++;
            const fixed = decode(id);
            edit.apply(fixed);
            applyFix(fixed, fix);
            // Every machine that took over a moving part of this one.
            const after = machines(fixed).filter(({ partition: part }) =>
              movingLinks(part).some((link) => before.has(link))
            );
            const counts = after.map(({ mechanism }) => mechanism.dof);
            if (counts.length !== 1 || counts[0] !== 1) {
              problems.push(
                `${where}: offered ${describeFix(fix)}, which left ${JSON.stringify(counts)} degrees of freedom`
              );
            }
          }
        }
      } catch (error) {
        problems.push(`${where}: threw ${String(error).slice(0, 160)}`);
      }
    }
  }

  it('holds for every drawing and every edit', () => {
    expect(drawings).toBeGreaterThan(800);
    expect(problems).toEqual([]);
  });

  it('actually checked some fixes', () => {
    expect(fixesChecked).toBeGreaterThan(300);
  });
});
