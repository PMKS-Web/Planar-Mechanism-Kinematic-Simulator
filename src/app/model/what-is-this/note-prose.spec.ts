import { echoesFamily, noteVocabulary, notePieces, panelNote } from './note-prose';

const rows = ['ground', 'link KILMNO ("Hood")', 'link GH', 'slider C', 'cylinder A-B'];
const words = noteVocabulary(rows, ['A', 'B', 'C', 'G', 'H']);
const family = (name: string) => ({ family: name, basis: '' });

describe('notePieces', () => {
  it('makes a bold part name a part, with or without its kind', () => {
    expect(notePieces('The **GH** link pulls **link KILMNO**.', words)).toEqual([
      'The ',
      { part: 'GH', label: 'GH' },
      ' link pulls ',
      { part: 'KILMNO', label: 'link KILMNO' },
      '.',
    ]);
  });

  it('finds the parts a model forgot to bold, the author’s names among them', () => {
    expect(notePieces('The cylinder A-B lifts the Hood through link GH.', words)).toEqual([
      'The ',
      { part: 'A-B', label: 'cylinder A-B' },
      ' lifts the ',
      { part: 'KILMNO', label: 'Hood' },
      ' through ',
      { part: 'GH', label: 'link GH' },
      '.',
    ]);
  });

  it('keeps an author’s name in quotes with its link, bold or not', () => {
    expect(notePieces('It lifts **link KILMNO ("Hood")** and link GH ("Strut").', words)).toEqual([
      'It lifts ',
      { part: 'KILMNO', label: 'link KILMNO ("Hood")' },
      ' and ',
      { part: 'GH', label: 'link GH ("Strut")' },
      '.',
    ]);
  });

  it('leaves a lone capital letter alone unless it is bold', () => {
    expect(notePieces('A beam rocks about **J**.', words)).toEqual([
      'A beam rocks about ',
      { part: 'J', label: 'J' },
      '.',
    ]);
  });

  it('keeps the words of a bold span that names no part', () => {
    expect(notePieces('It is a **bell crank**.', words)).toEqual(['It is a bell crank.']);
  });
});

describe('echoesFamily', () => {
  it('catches a "Looks like" that only repeats the family', () => {
    expect(echoesFamily('walking beam mechanism', [family('walking-beam mechanism')])).toBe(true);
    expect(echoesFamily('Watt six-bar function generator', [family('Watt six-bar')])).toBe(true);
  });

  it('keeps a machine the family does not name', () => {
    const gear = family('steam-locomotive running gear (driving wheels, side rod and main rod)');
    expect(echoesFamily('steam locomotive driving wheels', [gear])).toBe(false);
    expect(echoesFamily('oil well pumpjack', [family('walking-beam mechanism')])).toBe(false);
  });
});

describe('panelNote', () => {
  const answer = {
    plainEnglish: 'The **GH** link rocks the Hood.',
    resembles: 'car hood hinge',
    useCases: [{ use: 'Car hoods', why: 'It lifts the Hood clear.' }],
    terms: [
      { term: 'rocks', meaning: 'swings back and forth' },
      { term: 'coupler', meaning: 'a link with no fixed pivot' },
    ],
  };

  it('shows "Looks like" and the uses when the gate is open, and only terms the paragraph has', () => {
    const note = panelNote(answer, words, { show: true, because: '' }, []);
    expect(note.looksLike).toBe('car hood hinge');
    expect(note.uses.length).toBe(1);
    expect(note.terms.map((t) => t.term)).toEqual(['rocks']);
  });

  it('shows neither when the gate is shut', () => {
    const note = panelNote(answer, words, { show: false, because: '' }, []);
    expect(note.looksLike).toBeUndefined();
    expect(note.uses).toEqual([]);
  });
});
