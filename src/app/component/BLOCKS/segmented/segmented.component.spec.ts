import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SegmentedComponent } from './segmented.component';

/**
 * The states a joint's type needs from the one pick-one control: a reason on
 * every grayed option that a reader can reach without a pointer, no choice at
 * all for a group that disagrees, and the refusal ink on the chosen option
 * alone.
 */
@Component({
  imports: [SegmentedComponent],
  template: `
    <segmented-block
      [options]="options"
      [selected]="selected()"
      (selectedChange)="picked.push($event)"
      [disabledAt]="disabledAt()"
      [reasons]="reasons()"
      [icons]="icons()"
      [invalid]="invalid()"
      [label]="label()"
      [mixed]="mixed()"
      wrap
    ></segmented-block>
  `,
})
class Host {
  readonly options = ['Revolute', 'Prismatic', 'Pin-in-slot', 'Welded'];
  readonly selected = signal(0);
  readonly disabledAt = signal<number[]>([]);
  readonly reasons = signal<(string | undefined)[]>([]);
  readonly icons = signal<string[]>([]);
  readonly invalid = signal(false);
  readonly label = signal<string | undefined>(undefined);
  readonly mixed = signal(false);
  readonly picked: number[] = [];
}

const WELD_REFUSAL = 'A weld fuses the links that meet at a joint, and only one meets here.';

describe('SegmentedComponent', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  const root = () => fixture.nativeElement as HTMLElement;
  const buttons = () => [...root().querySelectorAll('button')] as HTMLButtonElement[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NoopAnimationsModule, Host],
    }).compileComponents();
    const registry = TestBed.inject(MatIconRegistry);
    const sanitizer = TestBed.inject(DomSanitizer);
    for (const name of ['joint_revolute', 'joint_prismatic', 'joint_pin_in_slot', 'joint_welded']) {
      registry.addSvgIconLiteral(name, sanitizer.bypassSecurityTrustHtml('<svg></svg>'));
    }
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
  });

  it('gives a grayed option its reason as a description, not only as a tooltip', () => {
    host.disabledAt.set([3]);
    host.reasons.set([undefined, undefined, undefined, WELD_REFUSAL]);
    fixture.detectChanges();

    const welded = buttons()[3];
    expect(welded.disabled).toBe(true);
    const describedBy = welded.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(root().querySelector(`#${describedBy}`)?.textContent?.trim()).toBe(WELD_REFUSAL);
    // An option that can be chosen has nothing to explain.
    expect(buttons()[1].hasAttribute('aria-describedby')).toBe(false);
  });

  it('refuses a press on a grayed option and on the chosen one, and passes on the rest', () => {
    host.disabledAt.set([3]);
    fixture.detectChanges();

    buttons()[3].click();
    buttons()[0].click();
    buttons()[1].click();

    expect(host.picked).toEqual([1]);
  });

  it('chooses nothing at -1: no option pressed, and no pill under any', () => {
    host.selected.set(-1);
    fixture.detectChanges();

    expect(buttons().filter((one) => one.getAttribute('aria-pressed') === 'true')).toEqual([]);
    expect(root().querySelector('.segmented')?.classList.contains('unchosen')).toBe(true);

    host.selected.set(2);
    fixture.detectChanges();
    expect(root().querySelector('.segmented')?.classList.contains('unchosen')).toBe(false);
    expect(buttons()[2].getAttribute('aria-pressed')).toBe('true');
  });

  it('draws the refusal ink on the chosen option alone, and follows the choice', () => {
    host.selected.set(2);
    host.invalid.set(true);
    fixture.detectChanges();
    expect(buttons().map((one) => one.classList.contains('invalid'))).toEqual([
      false,
      false,
      true,
      false,
    ]);

    host.selected.set(1);
    fixture.detectChanges();
    expect(buttons().map((one) => one.classList.contains('invalid'))).toEqual([
      false,
      true,
      false,
      false,
    ]);
  });

  it('names the choice on a row of its own, labels the group with it, and says Mixed', () => {
    fixture.detectChanges();
    expect(root().querySelector('.row')).toBeNull();

    host.label.set('Joint Type');
    host.mixed.set(true);
    fixture.detectChanges();

    const label = root().querySelector('.row .label') as HTMLElement;
    expect(label.textContent?.trim()).toBe('Joint Type');
    expect(root().querySelector('.segmented')?.getAttribute('aria-labelledby')).toBe(label.id);
    expect(root().querySelector('.row .mixed-state')?.textContent?.trim()).toBe('Mixed');
  });

  it('draws the glyph it is given before each label, without adding to the name', () => {
    host.icons.set(['joint_revolute', 'joint_prismatic', 'joint_pin_in_slot', 'joint_welded']);
    fixture.detectChanges();

    const glyphs = [...root().querySelectorAll('mat-icon.glyph')];
    expect(glyphs.map((glyph) => glyph.getAttribute('data-mat-icon-name'))).toEqual([
      'joint_revolute',
      'joint_prismatic',
      'joint_pin_in_slot',
      'joint_welded',
    ]);
    expect(buttons().map((one) => one.textContent?.trim())).toEqual(host.options);
  });
});
