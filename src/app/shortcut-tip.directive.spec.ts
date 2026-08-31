import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ViewButtonComponent } from './component/view-controls/view-button.component';
import { ShortcutTipDirective } from './shortcut-tip.directive';

@Component({
  standalone: true,
  imports: [ShortcutTipDirective],
  template: `<button appShortcutTip="Undo" shortcutTipFor="history.undo">u</button>`,
})
class HostComponent {}

describe('the shortcut tooltip', () => {
  /** Whatever the overlay put on screen, as text. */
  function shown(): HTMLElement | null {
    return document.querySelector('app-shortcut-tip');
  }

  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((one) => one.remove());
  });

  it('draws the name and the key as two different things', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.directive(ShortcutTipDirective));
    const tip = button.injector.get(ShortcutTipDirective);

    // Straight to the paint rather than through the hover delay, which is a
    // property of the pointer rather than of what gets drawn.
    tip['paint']();
    expect(shown()).not.toBeNull();
    // The key is its own element, which is the whole point: in one run of text
    // "Play / Pause (Space)" makes a reader find the brackets, and the keys are
    // not always at the end for them to find.
    const keys = shown()!.querySelector('.tipKeys');
    expect(keys).not.toBeNull();
    expect(keys!.tagName).toBe('KBD');
    expect(shown()!.querySelector('.tipText')!.textContent!.trim()).toBe('Undo');
    expect(keys!.textContent!.trim().length).toBeGreaterThan(0);

    tip.hide();
    expect(shown()).toBeNull();
  });

  it('is wired onto the view buttons, which is where half the shortcuts live', () => {
    // The binding is a property binding, so nothing about it survives into the
    // DOM as an attribute -- the only way to know it is attached is to ask
    // Angular. It was silently missing here once.
    const fixture = TestBed.createComponent(ViewButtonComponent);
    fixture.componentRef.setInput('noun', 'Joint IDs');
    fixture.componentRef.setInput('shortcut', 'view.jointIds');
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(ShortcutTipDirective))).not.toBeNull();
  });

  it('says what the press will do, without the keys written into the sentence', () => {
    const fixture = TestBed.createComponent(ViewButtonComponent);
    fixture.componentRef.setInput('noun', 'Joint IDs');
    fixture.componentRef.setInput('shortcut', 'view.jointIds');
    fixture.detectChanges();
    // The prose is prose. The key is added beside it by the directive, so it
    // lands at the end however long the sentence in front of it grows.
    expect(fixture.componentInstance.tip()).toBe('Show Joint IDs');
    expect(fixture.componentInstance.tip()).not.toContain('(');
  });
});
