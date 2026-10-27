// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { MOST_MACHINES } from '../../app/model/mechanism/mechanism-partition';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { fixturePayload } from '../../test-utils/verification/fixture-payload';
import { read } from '../../test-utils/verification/issue-text';
import { fiveCranksFixture } from '../../test-utils/verification/mobility-fixtures';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';

/**
 * A drawing runs at most four machines. A fifth is drawn and named, and says
 * why it does not run, but it is never solved.
 */
describe('the most machines one drawing runs', () => {
  function fiveCranks() {
    const harness = createMechanismHarness();
    const decoder = new StringTranscoder();
    decoder.decodeURL(fixturePayload(fiveCranksFixture()));
    new MechanismBuilder(harness.service, decoder, harness.settings, harness.active).build(true);
    harness.service.updateMechanism();
    return harness.service;
  }

  it('is four', () => {
    expect(MOST_MACHINES).toBe(4);
  });

  it('runs the first four machines and not the fifth', () => {
    const service = fiveCranks();
    expect(service.partitions.map((partition) => partition.id)).toEqual([
      'M1',
      'M2',
      'M3',
      'M4',
      'M5',
    ]);
    expect(service.mechanisms.map((mechanism) => mechanism.isMechanismValid())).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(service.mechanisms[4].failure).toBe('too-many-machines');
    // Never solved: the one frame it holds is the drawing as handed to it.
    expect(service.mechanisms[4].joints.length).toBe(1);
  });

  it('says why the fifth does not run, and what to do about it', () => {
    const [issue] = fiveCranks().readinessOfEachMechanism()[4].checks.map(read);
    expect(issue.title).toBe('Only 4 mechanisms run at once');
    expect(issue.summary).toBe("Mechanism 5 comes after the first 4, so it isn't simulated.");
    expect(issue.fixes).toEqual([
      "Delete Mechanism 5 if it's a leftover",
      'Attach Link from it to another mechanism',
    ]);
  });

  it('runs the fifth once another is deleted', () => {
    const service = fiveCranks();
    service.deleteMechanism(0);
    expect(service.mechanisms.map((mechanism) => mechanism.isMechanismValid())).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });
});
