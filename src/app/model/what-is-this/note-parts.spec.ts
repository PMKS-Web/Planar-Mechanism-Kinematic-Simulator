import { TEMPLATE_LINKAGES } from '../../component/MODALS/templates/template-linkages';
import { whatIsThisDrawing } from '../../../test-utils/what-is-this/drawing';
import { Joint } from '../joint';
import { Link } from '../link';
import { textOf } from '../prose';
import { machineFactSheets } from './machine-sheet';
import { noteKey } from './note-key';
import { noteProse } from './note-parts';
import { noteVocabulary, notePieces } from './note-prose';
import { panelRole } from './roles';

describe('a note’s part names', () => {
  const [sheet] = machineFactSheets(whatIsThisDrawing(TEMPLATE_LINKAGES['Bell_Crank']));
  const words = noteVocabulary(sheet.partNames.rows, sheet.partNames.joints);

  it('point at the drawing’s own parts', () => {
    const [row] = sheet.partNames.rows.filter((name) => name.startsWith('link '));
    const key = row.slice('link '.length);
    const pieces = notePieces(`The **${row}** turns about **joint A**.`, words);
    const prose = noteProse(pieces, sheet.parts);
    const parts = prose.filter((piece) => typeof piece !== 'string');
    expect(parts.map((piece) => (piece as { part: Joint | Link }).part)).toEqual([
      sheet.parts.get(key)!,
      sheet.parts.get('A')!,
    ]);
    expect(textOf(prose)).toBe(`The ${row} turns about joint A.`);
  });

  it('keep their words when the drawing no longer has the part', () => {
    const prose = noteProse(['The ', { part: 'ZZ', label: 'link ZZ' }, ' is gone.'], sheet.parts);
    expect(prose).toEqual(['The link ZZ is gone.']);
  });
});

describe('a link’s job in the Links rows', () => {
  const job = (text: string) => panelRole({ name: 'link AB', job: text, motion: '', links: [] });

  it('is the job’s first words, without the explanation the model is given', () => {
    expect(job('bell crank (a rocker whose two arms meet at an angle at its pivot)')).toBe(
      'Bell crank'
    );
    expect(job('input crank, carries traced point E')).toBe('Input crank');
    expect(job('cylinder; the block marked S on it is the cylinder’s own sliding seal')).toBe(
      'Cylinder'
    );
    expect(job('input link (driven at C)')).toBe('Input link');
    expect(job('coupler')).toBe('Coupler');
  });

  it('names every body of a machine that runs', () => {
    const [bell] = machineFactSheets(whatIsThisDrawing(TEMPLATE_LINKAGES['Bell_Crank']));
    const bodies = bell.jobs.filter((j) => j.links.length);
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.some((j) => panelRole(j) === 'Bell crank')).toBe(true);
  });
});

describe('noteKey', () => {
  it('files the same sheet under the same key, and any change under another', () => {
    expect(noteKey('a sheet')).toBe(noteKey('a sheet'));
    expect(noteKey('a sheet')).not.toBe(noteKey('a sheet.'));
    expect(noteKey('a sheet')).toMatch(/^[0-9a-f]{28}$/);
  });
});
