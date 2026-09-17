import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { KeyboardShortcutsService, ShortcutId } from './keyboard-shortcuts.service';

/**
 * The arrows are the one key in the table that means two things, so the choice
 * between them is the part worth pinning down.
 */
describe('KeyboardShortcutsService', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [KeyboardShortcutsService, { provide: MatDialog, useValue: { openDialogs: [] } }],
    });
    const service = TestBed.inject(KeyboardShortcutsService);
    const heard: ShortcutId[] = [];
    service.pressed.subscribe((id) => heard.push(id));
    return { service, heard };
  }

  const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, ...init });
    window.dispatchEvent(event);
    return event;
  };

  it('gives the arrows to the transport while nothing is selected', () => {
    const { heard } = setup();
    press('ArrowLeft');
    press('ArrowRight');
    expect(heard).toEqual(['playback.back', 'playback.forward']);
  });

  it('and to the selection once the canvas says there is one', () => {
    const { service, heard } = setup();
    service.whenArrowsNudge(() => true);
    press('ArrowLeft');
    press('ArrowRight');
    press('ArrowUp');
    press('ArrowDown');
    expect(heard).toEqual(['edit.nudgeLeft', 'edit.nudgeRight', 'edit.nudgeUp', 'edit.nudgeDown']);
  });

  it('leaves Up and Down alone when there is nothing to nudge', () => {
    const { heard } = setup();
    // Nothing to move and no transport meaning either, so the keystroke is not
    // answered -- and not swallowed on the way past.
    const up = press('ArrowUp');
    expect(heard).toEqual([]);
    expect(up.defaultPrevented).toBe(false);
  });

  it('carries the keystroke, because a coarse nudge is the same shortcut', () => {
    const { service } = setup();
    service.whenArrowsNudge(() => true);
    const seen: boolean[] = [];
    service.pressedKeys.subscribe(({ event }) => seen.push(event.altKey));
    press('ArrowUp', { altKey: true });
    press('ArrowUp');
    expect(seen).toEqual([true, false]);
  });

  it('answers a menu key nothing stopped: the card stops its own keys', () => {
    // This service carries no menu rule. One used to live here, matching
    // `role="menu"` -- which the phone's view sheet also wears, with plain
    // buttons that keep focus after a tap, so opening it took the shortcuts
    // quiet with it. The card and the project menu stop their own keys instead
    // (`ContextMenuComponent.onKey`, `TopBarComponent.onMenuKey`), and what
    // reaches this service is answered. `e2e/menu-focus.mjs` guards that half
    // in the browser; this half is that a bare menu node stops nothing.
    const { service, heard } = setup();
    service.whenArrowsNudge(() => true);
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    const item = document.createElement('div');
    item.setAttribute('role', 'menuitemradio');
    menu.appendChild(item);
    document.body.appendChild(menu);
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    item.dispatchEvent(event);
    // Answered, because no card stands over this bare node to stop the key on
    // its way here. In the app the card does, so Down walks the items and the
    // joint behind the card never moves.
    expect(heard).toEqual(['edit.nudgeDown']);
    expect(event.defaultPrevented).toBe(true);
    menu.remove();
  });

  it('lists the four arrows as one line for a reader', () => {
    const { service } = setup();
    const editing = service.bySection().find((one) => one.section === 'Editing')!;
    const nudges = editing.shortcuts.filter((one) => one.id.startsWith('edit.nudge'));
    expect(nudges).toHaveLength(1);
    expect(nudges[0].keys).toBe('← → ↑ ↓');
    // Option on a Mac, Alt everywhere else -- named the way this keyboard does.
    expect(nudges[0].label).toMatch(/\((Option|Alt) for a coarser step\)/);
  });
});
