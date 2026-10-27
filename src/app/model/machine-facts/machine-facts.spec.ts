import '../joint';
import { TEMPLATE_LINKAGES } from '../../component/MODALS/templates/template-linkages';
import { solvedDrawing } from '../../../test-utils/machine-facts/drawing';
import { machineFacts } from './machine-facts';
import { panelRole } from './roles';

/** What PMKS+ recognizes in each machine of a library drawing, in order. */
function familiesOf(id: keyof typeof TEMPLATE_LINKAGES): string[] {
  const { partitions, mechanisms } = solvedDrawing(TEMPLATE_LINKAGES[id]);
  return partitions.map((partition, index) => {
    const facts = machineFacts(partition, mechanisms[index]);
    return facts?.family[0]?.family ?? '';
  });
}

describe('what PMKS+ recognizes in a machine', () => {
  it('names the family of each machine in a drawing of several', () => {
    expect(familiesOf('Straight_Line_Pair')).toEqual([
      'Chebyshev straight-line linkage',
      'Peaucellier-Lipkin straight-line linkage',
    ]);
    expect(familiesOf('Pumping_Field')).toEqual([
      'walking-beam mechanism',
      'walking-beam mechanism',
      'walking-beam mechanism',
    ]);
  });

  it('reads a four-bar whose frame is drawn as a bar, not as a fifth link', () => {
    expect(familiesOf('Four_Bar_Inversions')).toEqual([
      'crank-rocker four-bar',
      'crank-rocker four-bar',
      'double-crank (drag-link) four-bar',
      'double-rocker four-bar',
    ]);
  });

  it('says nothing where its catalog matches nothing', () => {
    expect(familiesOf('Pantograph')).toEqual(['']);
  });

  it('gives each link of a four-bar its job, from the solved cycle', () => {
    const { partitions, mechanisms } = solvedDrawing(TEMPLATE_LINKAGES['4-Bar']);
    const jobs = machineFacts(partitions[0], mechanisms[0])!.jobs.map(panelRole);
    expect(jobs).toEqual(expect.arrayContaining(['Input crank', 'Coupler', 'Rocker']));
  });

  it('has nothing to say about a machine that does not run', () => {
    const { partitions } = solvedDrawing(TEMPLATE_LINKAGES['4-Bar']);
    expect(machineFacts(partitions[0], undefined)).toBeUndefined();
  });
});
