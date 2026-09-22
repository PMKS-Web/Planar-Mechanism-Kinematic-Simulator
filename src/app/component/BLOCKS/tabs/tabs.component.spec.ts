import { TestBed } from '@angular/core/testing';
import { TabsComponent } from './tabs.component';

async function setup(options = ['Rotation', 'Center of mass']) {
  const fixture = TestBed.createComponent(TabsComponent);
  fixture.componentRef.setInput('options', options);
  fixture.componentRef.setInput('idPrefix', 'example');
  fixture.componentRef.setInput(
    'panelIds',
    options.map((_, i) => `content-${i}`)
  );
  fixture.componentRef.setInput('label', 'Example panels');
  const changed = vi.fn((index: number) => fixture.componentRef.setInput('selected', index));
  fixture.componentInstance.selectedChange.subscribe(changed);
  fixture.detectChanges();
  const buttons: HTMLButtonElement[] = [...fixture.nativeElement.querySelectorAll('[role=tab]')];
  const key = (index: number, value: string) => {
    buttons[index].dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
    fixture.detectChanges();
  };
  return { fixture, buttons, key, changed };
}

describe('TabsComponent', () => {
  it('links named tabs to caller-owned panels and has one tab stop', async () => {
    const { fixture, buttons, changed } = await setup();
    expect(fixture.nativeElement.querySelector('[role=tablist]').getAttribute('aria-label')).toBe(
      'Example panels'
    );
    expect(buttons.map((button) => button.tabIndex)).toEqual([0, -1]);
    expect(buttons[1].id).toBe('example-tab-1');
    expect(buttons[1].getAttribute('aria-controls')).toBe('content-1');
    buttons[1].click();
    fixture.detectChanges();
    expect(changed).toHaveBeenCalledWith(1);
    expect(buttons.map((button) => button.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
    ]);
    expect(buttons.map((button) => button.tabIndex)).toEqual([-1, 0]);
  });

  it('wraps arrow-key navigation and supports Home and End with automatic selection', async () => {
    const { buttons, key, changed } = await setup([
      'Position',
      'Velocity',
      'Acceleration',
      'Force',
    ]);
    key(0, 'ArrowLeft');
    expect(document.activeElement).toBe(buttons[3]);
    expect(buttons[3].getAttribute('aria-selected')).toBe('true');
    key(3, 'ArrowRight');
    expect(document.activeElement).toBe(buttons[0]);
    key(0, 'End');
    expect(document.activeElement).toBe(buttons[3]);
    key(3, 'Home');
    expect(document.activeElement).toBe(buttons[0]);
    const calls = changed.mock.calls.length;
    key(0, 'Tab');
    expect(changed).toHaveBeenCalledTimes(calls);
  });

  it('previews on hover without selecting', async () => {
    const { fixture, buttons, changed } = await setup();
    const hovered = vi.fn();
    fixture.componentInstance.hoveredChange.subscribe(hovered);
    buttons[1].dispatchEvent(new MouseEvent('mouseenter'));
    expect(hovered).toHaveBeenLastCalledWith(1);
    buttons[1].dispatchEvent(new MouseEvent('mouseleave'));
    expect(hovered).toHaveBeenLastCalledWith(null);
    expect(changed).not.toHaveBeenCalled();
  });
});
