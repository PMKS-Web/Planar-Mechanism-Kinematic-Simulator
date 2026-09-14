import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ToggleComponent } from './toggle.component';

/**
 * `disabled` reaches the switch through its form control.
 *
 * It was a `[disabled]` binding beside `formControlName`, and that lost: a
 * reactive form pushes a control's state onto the switch when it sets the
 * control up, so a switch drawn disabled over an enabled control was only
 * painted disabled by the block's stylesheet, could still be turned from the
 * keyboard, and made Angular warn once for every switch on the page.
 */
@Component({
  imports: [ReactiveFormsModule, ToggleComponent],
  template: `
    @if (shown()) {
      <toggle-block [formGroup]="form" [_formControl]="name()" [disabled]="off()"
        >Gravity</toggle-block
      >
    }
  `,
})
class Host {
  readonly form = new FormGroup({
    gravity: new FormControl(true),
    snap: new FormControl(false),
  });
  readonly name = signal('gravity');
  readonly off = signal(false);
  readonly shown = signal(true);
}

const WARNING = 'disabled attribute with a reactive form directive';

describe('ToggleComponent disabled', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  const control = (name: 'gravity' | 'snap' = 'gravity') => host.form.controls[name];
  const switchButton = () =>
    fixture.nativeElement.querySelector('button[role="switch"]') as HTMLButtonElement | null;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NoopAnimationsModule, Host],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
  });

  it('is really disabled when drawn that way, not only painted so', () => {
    host.off.set(true);
    fixture.detectChanges();

    expect(control().disabled).toBe(true);
    expect(switchButton()?.disabled).toBe(true);
  });

  it('follows the input when it is turned off and back on', () => {
    fixture.detectChanges();
    expect(switchButton()?.disabled).toBe(false);

    host.off.set(true);
    fixture.detectChanges();
    expect(control().disabled).toBe(true);
    expect(switchButton()?.disabled).toBe(true);

    host.off.set(false);
    fixture.detectChanges();
    expect(control().disabled).toBe(false);
    expect(switchButton()?.disabled).toBe(false);
  });

  it('refuses a press while disabled', () => {
    host.off.set(true);
    fixture.detectChanges();

    switchButton()?.click();
    fixture.detectChanges();

    expect(control().value).toBe(true);
  });

  // The multi-selection panel disables its switches' controls itself and passes
  // that on as `disabled`. Those are not the block's to enable again.
  it('leaves alone a control its own form disabled', () => {
    control().disable();
    fixture.detectChanges();
    expect(control().disabled).toBe(true);

    host.off.set(true);
    fixture.detectChanges();
    host.off.set(false);
    fixture.detectChanges();

    expect(control().disabled).toBe(true);
  });

  // The Edit panel keeps one link form whichever link is selected. A control
  // left disabled by a block that has gone would come back disabled under the
  // next block drawn for it -- a crank's Draw as a Disc refusing, say.
  it('hands its control back when it goes, and the next block starts clean', () => {
    host.off.set(true);
    fixture.detectChanges();
    expect(control().disabled).toBe(true);

    host.shown.set(false);
    fixture.detectChanges();
    expect(control().disabled).toBe(false);

    host.off.set(false);
    host.shown.set(true);
    fixture.detectChanges();
    expect(switchButton()?.disabled).toBe(false);
  });

  it('hands the old control back when pointed at another', () => {
    host.off.set(true);
    fixture.detectChanges();

    host.name.set('snap');
    fixture.detectChanges();

    expect(control('gravity').disabled).toBe(false);
    expect(control('snap').disabled).toBe(true);
  });

  it('says nothing about the disabled attribute, however often it changes', () => {
    const warn = vi.spyOn(console, 'warn');
    fixture.detectChanges();
    for (const off of [true, false, true, false]) {
      host.off.set(off);
      fixture.detectChanges();
    }

    const said = warn.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(said.filter((text: string) => text.includes(WARNING))).toEqual([]);
  });

  // Disabling a control recomputes its group's pristine and valid, and a
  // `[formGroup]` on the block's own tag wears those as classes in the parent's
  // view -- checked before the block's effect runs. Were those plain reads, the
  // dev-mode second pass would throw changed-after-checked.
  it('does not change anything already checked when a dirty form is disabled', () => {
    fixture.detectChanges();
    control().markAsDirty();
    fixture.detectChanges();

    host.off.set(true);
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(control().disabled).toBe(true);
  });
});
