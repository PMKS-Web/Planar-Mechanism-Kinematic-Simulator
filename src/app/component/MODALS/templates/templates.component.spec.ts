import { isDevMode } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { DEV_TEMPLATES } from './dev-templates';
import { DEV_TEMPLATE_CARDS, TEMPLATE_CARDS, TEMPLATE_CATEGORIES } from './template-catalog';
import { TEMPLATE_IDS, TEMPLATE_LINKAGES } from './template-linkages';
import { TemplatesComponent } from './templates.component';

// The library is a table now (template-catalog.ts) rather than a wall of
// hand-written cards, so the thing that can go wrong has changed: a template
// with no row is invisible, and a row with no payload is a dead card. Both are
// checked here, along with the filtering the table exists to make possible.

describe('template catalog', () => {
  it('gives every template exactly one card', () => {
    const carded = TEMPLATE_CARDS.map((card) => card.id as string).sort();
    const offered = [...TEMPLATE_IDS].map((id) => id as string).sort();

    // Named both ways round: one list says which template has no card yet, the
    // other which card names a template that has been removed.
    expect(offered.filter((id) => !carded.includes(id))).toEqual([]);
    expect(carded.filter((id) => !offered.includes(id))).toEqual([]);
    expect(new Set(carded).size).toBe(carded.length);
  });

  it('reaches a payload from every card', () => {
    for (const card of TEMPLATE_CARDS) {
      expect(typeof TEMPLATE_LINKAGES[card.id as keyof typeof TEMPLATE_LINKAGES]).toBe('string');
    }
    for (const card of DEV_TEMPLATE_CARDS) {
      expect(typeof DEV_TEMPLATES[card.id as keyof typeof DEV_TEMPLATES]).toBe('string');
    }
  });

  it('files every card under a declared category, with an asset behind it', () => {
    const categories = TEMPLATE_CATEGORIES.map((category) => category.id as string);

    for (const card of [...TEMPLATE_CARDS, ...DEV_TEMPLATE_CARDS]) {
      expect(categories).toContain(card.category);
      expect(card.thumbnail.startsWith('assets/gifs/')).toBe(true);
      expect(card.animation ?? 'assets/gifs/').toMatch(/^assets\/gifs\//);
    }
  });

  it('describes every card in a line the caption can hold', () => {
    for (const card of [...TEMPLATE_CARDS, ...DEV_TEMPLATE_CARDS]) {
      expect(card.name.length).toBeGreaterThan(0);
      // Three clamped lines is what the band over the thumbnail reserves room
      // for; past this a description is silently cut off.
      expect(card.description.length).toBeGreaterThan(20);
      expect(card.description.length).toBeLessThanOrEqual(140);
    }
  });

  it('says mechanism, never linkage', () => {
    for (const card of [...TEMPLATE_CARDS, ...DEV_TEMPLATE_CARDS]) {
      expect(`${card.name} ${card.description}`.toLowerCase()).not.toContain('linkage');
    }
  });
});

describe('library dialog', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TemplatesComponent],
      providers: [provideAnimations()],
    }).compileComponents();
  });

  function open() {
    const fixture = TestBed.createComponent(TemplatesComponent);
    fixture.detectChanges();
    return fixture;
  }

  function cards(fixture: { nativeElement: HTMLElement }): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.templateCard')).map(
      (card) => card.getAttribute('data-template') ?? ''
    );
  }

  function chip(fixture: { nativeElement: HTMLElement }, name: string): HTMLButtonElement {
    const found = Array.from(
      fixture.nativeElement.querySelectorAll<HTMLButtonElement>('.chip')
    ).find((button) => (button.textContent ?? '').includes(name));
    expect(found).toBeTruthy();
    return found!;
  }

  function search(fixture: { nativeElement: HTMLElement }, text: string) {
    const input = fixture.nativeElement.querySelector('.searchBox input') as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input'));
  }

  it('shows a card per template, with its description over the thumbnail', () => {
    const fixture = open();
    const shown = cards(fixture);

    for (const id of TEMPLATE_IDS) expect(shown).toContain(id);
    expect(fixture.nativeElement.querySelectorAll('.caption .cardDescription').length).toBe(
      shown.length
    );
    expect(fixture.nativeElement.textContent).toContain('Four-Bar');
    expect(fixture.nativeElement.textContent).toContain('a crank turns, a rocker swings');
  });

  it('heads each family it has cards for, and stays quiet about the ones it does not', () => {
    const headings = Array.from(
      (open().nativeElement as HTMLElement).querySelectorAll('.sectionHeading')
    ).map((heading) => heading.textContent?.trim());

    // Asked of the data rather than against a list of names, so adding a
    // mechanism does not send anyone back here to update a snapshot. An empty
    // category is not a category yet: declaring one before its first mechanism
    // exists must not leave a bare heading behind.
    const populated = new Set(TEMPLATE_CARDS.map((card) => card.category));
    for (const category of TEMPLATE_CATEGORIES) {
      if (category.id === 'dev') continue;
      const expected = populated.has(category.id);
      expect(headings.includes(category.name)).toBe(expected);
    }
    expect(headings.length).toBeGreaterThan(1);
    if (!isDevMode()) expect(headings).not.toContain('For Development');
  });

  it('narrows to one family and back to all of them', () => {
    const fixture = open();
    const everything = cards(fixture).length;

    chip(fixture, 'Cylinders').click();
    fixture.detectChanges();
    const cylinders = cards(fixture);
    expect(cylinders).toContain('Cylinder_Boom');
    expect(cylinders).not.toContain('4-Bar');

    chip(fixture, 'All').click();
    fixture.detectChanges();
    expect(cards(fixture).length).toBe(everything);
  });

  it('searches names and descriptions, and offers the way back when nothing matches', () => {
    const fixture = open();

    // Two cards name the leg now: the one that is a leg, and the pair of them
    // walking. Both are the right answer to "jansen".
    search(fixture, 'jansen');
    fixture.detectChanges();
    expect(cards(fixture).sort()).toEqual(['Jansen_Leg', 'Walking_Pair']);

    // The words are in the description, not the name.
    search(fixture, 'welded rider');
    fixture.detectChanges();
    expect(cards(fixture)).toEqual(['Scotch_Yoke']);

    search(fixture, 'gearbox');
    fixture.detectChanges();
    expect(cards(fixture).length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Nothing in the library matches');

    (fixture.nativeElement.querySelector('.emptyState button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(cards(fixture).length).toBeGreaterThan(0);
  });

  it('counts what each chip would show, including under a search', () => {
    const fixture = open();
    const countOn = (name: string) =>
      Number(chip(fixture, name).querySelector('.chipCount')?.textContent?.trim());

    // From the table, not a number typed in here: the count is a promise about
    // what pressing the chip shows, and it is that promise being checked.
    const startCards = TEMPLATE_CARDS.filter((card) => card.category === 'start').length;
    expect(startCards).toBeGreaterThan(0);
    expect(countOn('Start Here')).toBe(startCards);

    search(fixture, 'cylinder');
    fixture.detectChanges();
    expect(countOn('Start Here')).toBe(0);
    expect(countOn('Cylinders')).toBeGreaterThan(0);
  });
});
