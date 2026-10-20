import {
  blankSuggestion,
  DESCRIPTION_LIMIT,
  fieldError,
  SUGGESTABLE_SECTIONS,
  suggestionParams,
  TITLE_LIMIT,
  whatToFix,
} from './suggestion';

describe('a suggestion', () => {
  it('names what to fix, counted and in the order the form reads', () => {
    expect(whatToFix(['title'])).toBe('One thing to fix before this can send: the title.');
    expect(whatToFix(['description', 'title'])).toBe(
      'Two things to fix before this can send: the title and the description.'
    );
    expect(whatToFix(['consent', 'link', 'email'])).toBe(
      'Three things to fix before this can send: the link, the email and the permission box.'
    );
  });

  it('refuses a title of spaces, and one over its limit without cutting it', () => {
    const form = blankSuggestion();
    form.controls.title.setValue('   ');
    expect(fieldError(form, 'title')).toBe('Give it a title.');

    // Shown as typed: nothing in the form trims what was pasted.
    const long = 'x'.repeat(TITLE_LIMIT + 10);
    form.controls.title.setValue(long);
    expect(form.controls.title.value).toBe(long);
    expect(fieldError(form, 'title')).toBe(`Shorten it to ${TITLE_LIMIT} characters.`);

    form.controls.description.setValue('y'.repeat(DESCRIPTION_LIMIT + 1));
    expect(fieldError(form, 'description')).toBe(`Shorten it to ${DESCRIPTION_LIMIT} characters.`);
  });

  it('asks for permission, and for a real address only when one is given', () => {
    const form = blankSuggestion();
    expect(fieldError(form, 'consent')).toContain('Tick this to send it.');
    expect(fieldError(form, 'email')).toBe('');
    form.controls.email.setValue('pat@');
    expect(fieldError(form, 'email')).toBe('That is not an email address.');
  });

  it('offers every library section but the development one, and Not Sure last', () => {
    const names = SUGGESTABLE_SECTIONS.map((section) => section.name);
    expect(names).not.toContain('For Development');
    expect(names[0]).toBe('Start Here');
    expect(names[names.length - 1]).toBe('Not Sure');
  });

  it('sends every field, and says what an empty one means', () => {
    const form = blankSuggestion();
    form.setValue({
      source: 'pasted-link',
      link: 'https://app.pmksplus.com/?z=1',
      title: ' Hoeken’s Straight-Line ',
      description: 'A crank-rocker whose coupler tip runs nearly straight.',
      section: 'unsure',
      credit: '',
      email: '',
      consent: true,
    });
    const params = suggestionParams(
      form.getRawValue(),
      'https://app.pmksplus.com/?z=1',
      'Four-bar linkage · 4 links · 4 joints · runs',
      'Browser: Chrome'
    );
    expect(params['to_email']).toBe('help@pmksplus.com');
    expect(params['subject']).toBe('Library suggestion: Hoeken’s Straight-Line');
    expect(params['section']).toBe('Not sure');
    expect(params['credit']).toBe('Anonymous');
    expect(params['email']).toBe('No reply wanted');
    expect(params['source']).toBe('pasted-link');
    expect(params['project']).toBe('https://app.pmksplus.com/?z=1');
    expect(params['consent']).toBe('yes');
    // The feedback template reads only `message`, so the whole suggestion is
    // in it as well.
    expect(params['message']).toContain('Description: A crank-rocker');
    expect(params['message']).toContain('Mechanism: Four-bar linkage');
  });
});
