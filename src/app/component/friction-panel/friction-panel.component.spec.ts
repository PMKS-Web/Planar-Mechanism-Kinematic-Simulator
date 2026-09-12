import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { FrictionPanelComponent } from './friction-panel.component';
import { frictionStoryState } from '../../../stories/support/friction-stubs';
import { LengthUnit } from '../../model/unit-enums';

function mount(kind: 'guide' | 'pin', enabled = true, disabled = false, readOnly = false) {
  const state = frictionStoryState(kind, enabled, LengthUnit.CM, disabled);
  TestBed.configureTestingModule({
    imports: [FrictionPanelComponent],
    providers: [...state.providers, provideNoopAnimations()],
  });
  const fixture = TestBed.createComponent(FrictionPanelComponent);
  fixture.componentRef.setInput('joint', state.joint);
  fixture.componentRef.setInput('readOnly', readOnly);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  root.querySelector<HTMLButtonElement>('.panel-header__toggle')!.click();
  fixture.detectChanges();
  return { state, fixture, root };
}
describe('friction panel states', () => {
  it('uses guide coefficients without an irrelevant radius', () => {
    const { root } = mount('guide');
    expect(root.querySelectorAll('input').length).toBe(2);
    expect(root.textContent).toContain('Additional input force');
    expect(root.textContent).not.toContain('Effective Radius');
  });
  it('exposes a physical bearing radius and static capacity', () => {
    const { root } = mount('pin');
    expect(root.querySelectorAll('input').length).toBe(3);
    expect(root.textContent).toContain('Effective Radius');
    expect(root.textContent).toContain('Static Limit');
  });
  it('identifies frictionless defaults', () => {
    expect(mount('guide', false).root.textContent).toContain('Frictionless contact.');
  });
  it('disables native controls during playback and shows the reason', () => {
    const { root } = mount('guide', true, true);
    expect(root.querySelectorAll('input:disabled').length).toBe(2);
    expect(root.querySelector<HTMLButtonElement>('button-block button')!.disabled).toBe(true);
    expect(root.textContent).toContain('Pause playback');
  });
  it('keeps read-only coefficients and results without editable fields', () => {
    const { root } = mount('pin', true, false, true);
    expect(root.querySelectorAll('input').length).toBe(0);
    expect(root.textContent).toContain('Kinetic coefficient');
  });
  it('refuses invalid coefficients and clears a stale error when selection changes', () => {
    const { root, fixture, state } = mount('guide');
    const input = root.querySelectorAll('input')[1];
    input.value = '.4';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    root.querySelector<HTMLButtonElement>('button-block button')!.click();
    fixture.detectChanges();
    expect(root.querySelector('[role=alert]')!.textContent).toContain('at least');
    expect(state.joint.friction.kineticCoefficient).toBe(0.2);
    fixture.componentRef.setInput('joint', frictionStoryState('guide').joint);
    fixture.detectChanges();
    expect(root.querySelector('[role=alert]')).toBeNull();
  });
});
