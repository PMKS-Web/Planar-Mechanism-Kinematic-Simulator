// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import {
  LIBRARY_TEMPLATE_IDS,
  TEMPLATE_LINKAGES,
} from '../../app/component/MODALS/templates/template-linkages';
import { LIBRARY_TEMPLATE_NAMES } from '../../test-utils/verification/template-fixtures';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';
import { partitionMechanisms } from '../../app/model/mechanism/mechanism-partition';
import { MAX_MECHANISM_NAME, mechanismName } from '../../app/model/mechanism/mechanism-name';

/**
 * Every library template opens with its machines named.
 *
 * Read back off the published payload, not off the table: what a reader gets
 * is what the URL carries, and a name the encoder dropped or the reader split
 * at a stray separator would pass any check made on the table alone.
 */
describe('the names a library template opens with', () => {
  /** The rule a typed name meets in the panel, less the apostrophe the payload's quotes forbid. */
  const NAME_RULE = /^[a-zA-Z0-9][a-zA-Z0-9 ()_-]*$/;

  for (const id of LIBRARY_TEMPLATE_IDS) {
    it(`names every machine in ${id}, as the table says`, () => {
      const { service } = buildMechanismFixture(TEMPLATE_LINKAGES[id]);
      const machines = partitionMechanisms(
        service.joints,
        service.links,
        service.forces
      ).mechanisms;
      const names = machines.map((machine) => mechanismName(machine));

      expect(names.every((name) => !!name)).toBe(true);
      expect([...names].sort()).toEqual(Object.values(LIBRARY_TEMPLATE_NAMES[id]).sort());
      for (const name of names as string[]) {
        expect(name).toMatch(NAME_RULE);
        expect(name.length).toBeLessThanOrEqual(MAX_MECHANISM_NAME);
      }
      // One name per thing: two machines, or a machine and one of its own parts,
      // called the same are two things a selection, a graph legend or an export
      // column cannot tell apart. Case is presentation, as the panel treats it.
      const taken = [...service.joints, ...service.links, ...service.forces].map((part) =>
        String(part.name || part.id).toLowerCase()
      );
      const lower = (names as string[]).map((name) => name.toLowerCase());
      expect(new Set(lower).size).toBe(lower.length);
      expect(lower.filter((name) => taken.includes(name))).toEqual([]);
    });
  }
});
