import { TEMPLATE_LINKAGES } from '../../component/MODALS/templates/template-linkages';
import { whatIsThisDrawing } from '../../../test-utils/what-is-this/drawing';
import { machineFactSheets } from './machine-sheet';

const sheetsOf = (id: keyof typeof TEMPLATE_LINKAGES, backdrop?: string) =>
  machineFactSheets(whatIsThisDrawing(TEMPLATE_LINKAGES[id], backdrop));

describe('machineFactSheets', () => {
  it('writes one sheet per machine, each naming the others as context', () => {
    const sheets = sheetsOf('Pumping_Field');
    expect(sheets.map((s) => s.index)).toEqual([0, 1, 2]);
    const m2 = sheets[1].text;
    expect(m2).toContain('## Mechanism M2');
    expect(m2).not.toContain('## Mechanism M1');
    expect(m2).toContain('this sheet is about M2 alone');
    expect(m2).toContain('M1 is the same design as this one');
  });

  it('says what PMKS+ matched each machine as', () => {
    const [m1, m2] = sheetsOf('Straight_Line_Pair');
    expect(m1.family[0].family).toBe('Chebyshev straight-line linkage');
    expect(m2.family[0].family).toBe('Peaucellier-Lipkin straight-line linkage');
    expect(m1.text).toContain('M2 is a different design (PMKS+ matched Peaucellier-Lipkin');
  });

  it('names a bell crank among the links’ jobs', () => {
    const [sheet] = sheetsOf('Bell_Crank');
    expect(sheet.jobs.some((job) => job.job.startsWith('bell crank'))).toBe(true);
    expect(sheet.gate.show).toBe(false);
  });

  it('opens the gate on a name its author typed', () => {
    const [sheet] = sheetsOf('Hood_Hinge');
    expect(sheet.text).toContain('("Hood")');
    expect(sheet.gate.show).toBe(true);
  });

  it('gives the background image’s file name, and lays out six tiles with it first', () => {
    const [sheet] = sheetsOf('Hood_Hinge', 'car-hood.jpg');
    expect(sheet.text).toContain('Its file is named "car-hood.jpg", which may say what it shows.');
    expect(sheet.backdropTile).toBe(true);
    expect(sheet.moments.length).toBe(5);
    expect(sheetsOf('Hood_Hinge')[0].moments.length).toBe(6);
  });
});
