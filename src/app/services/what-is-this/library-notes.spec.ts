import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TEMPLATE_CARDS } from '../../component/MODALS/templates/template-catalog';
import { TEMPLATE_LINKAGES, TemplateID } from '../../component/MODALS/templates/template-linkages';
import { machineFactSheets } from '../../model/what-is-this/machine-sheet';
import { WHAT_IS_THIS_VERSION } from '../../model/what-is-this/prompt';
import { whatIsThisDrawing } from '../../../test-utils/what-is-this/drawing';
import { LIBRARY_NOTES_PATH, LibraryNotes } from './note-store';

/**
 * The library's notes ship with the app so that opening a library mechanism
 * asks the model nothing. A note is found by its fact sheet's key, so a
 * template or a prompt that changed since the file was written leaves its
 * machines without one, silently: every student then asks for it again.
 * `npm run what-is-this:library` writes the file afresh.
 */
describe('the library’s shipped notes', () => {
  const file: LibraryNotes = JSON.parse(
    readFileSync(resolve('src', LIBRARY_NOTES_PATH), 'utf8')
  ) as LibraryNotes;

  it('are for the prompt the app sends', () => {
    expect(file.version).toBe(WHAT_IS_THIS_VERSION);
  });

  for (const card of TEMPLATE_CARDS) {
    it(`cover every machine of ${card.name}`, () => {
      // A card's picture goes by its file's name, as the library places it.
      const fileName = card.backdrop?.src.split('/').pop();
      const sheets = machineFactSheets(
        whatIsThisDrawing(TEMPLATE_LINKAGES[card.id as TemplateID], fileName)
      );
      for (const sheet of sheets) {
        expect(
          file.notes[sheet.key],
          `${card.name} M${sheet.index + 1} has no note: run npm run what-is-this:library`
        ).toBeDefined();
      }
    });
  }
});
