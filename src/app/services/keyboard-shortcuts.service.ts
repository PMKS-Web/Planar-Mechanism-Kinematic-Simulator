import { Injectable, NgZone, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, Subject, map } from 'rxjs';

/**
 * Everything a key can ask for. The string is the shortcut's identity: the
 * registry below names it, the component that owns the action listens for it,
 * and a tooltip asks for its keys by it.
 */
export type ShortcutId =
  | 'mode.synthesis'
  | 'mode.edit'
  | 'mode.kinematic'
  | 'mode.force'
  | 'playback.toggle'
  | 'playback.back'
  | 'playback.forward'
  | 'playback.speed'
  | 'view.zoomIn'
  | 'view.zoomOut'
  | 'view.reset'
  | 'view.centerOfMass'
  | 'view.jointIds'
  | 'view.paths'
  | 'edit.lock'
  | 'edit.deselect'
  | 'edit.delete'
  | 'edit.nudgeLeft'
  | 'edit.nudgeRight'
  | 'edit.nudgeUp'
  | 'edit.nudgeDown'
  | 'history.undo'
  | 'history.redo'
  | 'app.settings'
  | 'app.help';

export interface Shortcut {
  id: ShortcutId;
  /** The heading this falls under wherever the whole set is listed. */
  section: 'Modes' | 'Playback' | 'View' | 'Editing' | 'General';
  /** What pressing it does, in the same words the control it doubles uses. */
  label: string;
  /** The keys as a reader should see them, already in this platform's signs. */
  keys: string;
  /** `event.key` values that fire it, lowercased. */
  match: string[];
  /** Whether Ctrl (or Command) has to be down. Undefined means "must not be". */
  meta?: boolean;
  /**
   * Matched, but not given a row of its own where the set is listed.
   *
   * Four arrow keys are four shortcuts to the dispatcher and one line to a
   * reader, so three of the four hide behind the row that names all of them.
   */
  hidden?: boolean;
}

/** A shortcut, with the keystroke that asked for it. */
export interface ShortcutPress {
  id: ShortcutId;
  event: KeyboardEvent;
}

/** What the three arrow shortcuts after the first repeat. */
const NUDGE = {
  section: 'Editing',
  label: 'Nudge what is selected',
  keys: '← → ↑ ↓',
  hidden: true,
} as const;

/** Each arrow's two meanings. Left and right have somewhere to fall back to. */
const ARROWS: Record<string, { nudge: ShortcutId; playback?: ShortcutId }> = {
  arrowleft: { nudge: 'edit.nudgeLeft', playback: 'playback.back' },
  arrowright: { nudge: 'edit.nudgeRight', playback: 'playback.forward' },
  arrowup: { nudge: 'edit.nudgeUp' },
  arrowdown: { nudge: 'edit.nudgeDown' },
};

/** Command on a Mac, Ctrl everywhere else -- shown the way the platform writes it. */
function onAMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

/**
 * The keys, and what they ask for.
 *
 * One table, because a shortcut has to be two things at once and they must not
 * drift: the key that fires it, and the hint on the control it doubles. A
 * hint written into a template by hand is a hint nobody updates when the key
 * moves -- so nothing here is written twice, and a control asks for its own
 * hint by id.
 *
 * The actions are deliberately *not* here. They belong to the components that
 * already own them, with the guards those components already apply -- a mode
 * that is not ready opens its setup drawer rather than switching, and a
 * transport with nothing to play stays put. A service reaching past them to do
 * the work itself would have to repeat every one of those rules.
 */
@Injectable({ providedIn: 'root' })
export class KeyboardShortcutsService {
  private zone = inject(NgZone);
  private dialog = inject(MatDialog);
  private readonly presses = new Subject<ShortcutPress>();

  /** Fires when a shortcut's keys are pressed anywhere outside a text field. */
  readonly pressed: Observable<ShortcutId> = this.presses.pipe(map((press) => press.id));

  /**
   * The same presses, carrying the keystroke.
   *
   * For the actions whose *size* depends on a modifier rather than their
   * identity: a nudge is the same action held coarse, not a second shortcut.
   */
  readonly pressedKeys: Observable<ShortcutPress> = this.presses.asObservable();

  /**
   * Whether an arrow would move something on the canvas right now.
   *
   * The arrows mean two things -- step a frame, or nudge what is selected --
   * and one keystroke can only be one shortcut, so the choice has to be made
   * here. What it may not do is make it *itself*: whether a selection can be
   * moved is a question with a long answer that the canvas already owns, so
   * the canvas hands that answer over and this only asks.
   */
  private arrowsNudge: () => boolean = () => false;

  whenArrowsNudge(predicate: () => boolean): void {
    this.arrowsNudge = predicate;
  }

  private readonly mod = onAMac() ? '⌘' : 'Ctrl';
  /** The same key by its two names: Option on a Mac, Alt on every keyboard else. */
  private readonly alt = onAMac() ? 'Option' : 'Alt';

  readonly shortcuts: Shortcut[] = [
    { id: 'mode.synthesis', section: 'Modes', label: 'Synthesis', keys: '1', match: ['1'] },
    { id: 'mode.edit', section: 'Modes', label: 'Edit', keys: '2', match: ['2'] },
    {
      id: 'mode.kinematic',
      section: 'Modes',
      label: 'Kinematic Analysis',
      keys: '3',
      match: ['3'],
    },
    { id: 'mode.force', section: 'Modes', label: 'Force Analysis', keys: '4', match: ['4'] },

    {
      id: 'playback.toggle',
      section: 'Playback',
      label: 'Play / Pause',
      keys: 'Space',
      match: [' ', 'spacebar'],
    },
    {
      id: 'playback.back',
      section: 'Playback',
      label: 'Step back one frame',
      keys: '←',
      match: ['arrowleft'],
    },
    {
      id: 'playback.forward',
      section: 'Playback',
      label: 'Step forward one frame',
      keys: '→',
      match: ['arrowright'],
    },
    {
      id: 'playback.speed',
      section: 'Playback',
      label: 'Cycle playback speed',
      keys: 'S',
      match: ['s'],
    },

    { id: 'view.zoomIn', section: 'View', label: 'Zoom In', keys: '+', match: ['+', '='] },
    { id: 'view.zoomOut', section: 'View', label: 'Zoom Out', keys: '−', match: ['-', '_'] },
    { id: 'view.reset', section: 'View', label: 'Reset View', keys: '0', match: ['0'] },
    {
      id: 'view.centerOfMass',
      section: 'View',
      label: 'Center of mass',
      keys: 'M',
      match: ['m'],
    },
    { id: 'view.jointIds', section: 'View', label: 'Joint IDs', keys: 'L', match: ['l'] },
    { id: 'view.paths', section: 'View', label: 'Traced paths', keys: 'P', match: ['p'] },

    {
      id: 'edit.lock',
      section: 'Editing',
      label: 'Lock / Unlock what is selected',
      keys: 'K',
      match: ['k'],
    },
    {
      id: 'edit.deselect',
      section: 'Editing',
      label: 'Deselect',
      keys: 'Esc',
      match: ['escape', 'esc'],
    },
    {
      id: 'edit.delete',
      section: 'Editing',
      label: 'Delete what is selected',
      // Backspace as well as Delete: a MacBook has one key here and it sends
      // Backspace, so Delete alone left the shortcut unreachable on the
      // keyboard it is printed on.
      keys: 'Delete',
      match: ['delete', 'backspace'],
    },
    {
      id: 'edit.nudgeLeft',
      section: 'Editing',
      label: `Nudge what is selected (${this.alt} for a coarser step)`,
      keys: '← → ↑ ↓',
      match: ['arrowleft'],
    },
    { id: 'edit.nudgeRight', ...NUDGE, match: ['arrowright'] },
    { id: 'edit.nudgeUp', ...NUDGE, match: ['arrowup'] },
    { id: 'edit.nudgeDown', ...NUDGE, match: ['arrowdown'] },
    {
      id: 'history.undo',
      section: 'Editing',
      label: 'Undo',
      keys: `${this.mod}Z`,
      match: ['z'],
      meta: true,
    },
    {
      id: 'history.redo',
      section: 'Editing',
      label: 'Redo',
      keys: `${this.mod}⇧Z`,
      match: ['y'],
      meta: true,
    },
    {
      id: 'app.settings',
      section: 'General',
      label: 'Settings',
      // The key every application puts preferences on, minus the modifier:
      // nothing on this canvas is typed, so the plain comma is free.
      keys: ',',
      match: [','],
    },
    {
      id: 'app.help',
      section: 'General',
      label: 'Help, and this list',
      keys: '?',
      // The character, not the keystroke that makes it: which key and which
      // modifiers produce a question mark is a matter of layout, and asking
      // for Shift and the US layout's slash left it unreachable on the rest.
      match: ['?'],
    },
  ];

  constructor() {
    if (typeof window === 'undefined') return;
    // Outside Angular, then back in only when a key actually matches: this
    // listener sees every keystroke in the app, and a change-detection pass
    // per keystroke is a pass per character typed into every field.
    this.zone.runOutsideAngular(() =>
      window.addEventListener('keydown', (event) => this.onKeyDown(event))
    );
  }

  /**
   * Whether a keystroke is this shortcut.
   *
   * The same test the dispatcher uses, exposed for the few places that have to
   * answer a key themselves -- a popover that stops every other shortcut still
   * owes the ones it prints on its own rows.
   */
  matches(id: ShortcutId, event: KeyboardEvent): boolean {
    const found = this.shortcuts.find((one) => one.id === id);
    if (!found) return false;
    const held = event.ctrlKey || event.metaKey;
    return found.match.includes(event.key.toLowerCase()) && !!found.meta === held;
  }

  /** The keys for a control's tooltip, or nothing if it has no shortcut. */
  keysFor(id: ShortcutId): string {
    return this.shortcuts.find((one) => one.id === id)?.keys ?? '';
  }

  /**
   * A tooltip with its shortcut on the end: "Zoom In (+)".
   *
   * The name first and the key in brackets after it, because the name is what
   * a reader came to the tooltip for and the key is what they leave with.
   */
  tip(name: string, id: ShortcutId): string {
    const keys = this.keysFor(id);
    return keys ? `${name} (${keys})` : name;
  }

  /** The whole set, grouped, for the list that teaches them. */
  bySection(): { section: string; shortcuts: Shortcut[] }[] {
    const sections: string[] = [];
    for (const one of this.shortcuts) {
      if (!sections.includes(one.section)) sections.push(one.section);
    }
    return sections.map((section) => ({
      section,
      shortcuts: this.shortcuts.filter((one) => one.section === section && !one.hidden),
    }));
  }

  private onKeyDown(event: KeyboardEvent): void {
    // A key pressed into a text field belongs to that field: Delete means
    // delete a character there, and Undo means undo the typing.
    if (this.typingInAField(event)) return;
    // And Space or Enter on something that answers them itself belongs to it.
    if (this.targetAnswersKey(event)) return;
    // And a key pressed while something stands over the canvas belongs to that
    // thing, or to nothing. These are the canvas's keys: with the Templates
    // dialog open, Delete was removing the selected joint behind it, out of
    // sight of the reader who pressed it.
    if (this.somethingIsOver()) return;

    const key = event.key.toLowerCase();
    const held = event.ctrlKey || event.metaKey;
    // Redo is Undo's key with Shift, as well as its own -- so it is looked for
    // first, or the plain Undo match would swallow it.
    // The arrows are two shortcuts on one key and are settled before the table
    // is searched, or whichever of the two is listed first would take them all.
    const arrow = !held ? ARROWS[key] : undefined;
    const wanted = arrow
      ? this.arrowsNudge()
        ? arrow.nudge
        : arrow.playback
      : held && key === 'z' && event.shiftKey
        ? 'history.redo'
        : this.shortcuts.find((one) => one.match.includes(key) && !!one.meta === held)?.id;
    // Up and Down mean nothing with no selection to move, so they fall through
    // to whatever the browser does with them rather than being swallowed.
    if (!wanted) return;
    // A shortcut that reached us is a shortcut we are answering: Space would
    // otherwise scroll the page and Command-Z would reach the browser's own.
    event.preventDefault();
    this.zone.run(() => this.presses.next({ id: wanted, event }));
  }

  /**
   * Whether the canvas is covered by a conversation of its own.
   *
   * Only dialogs now. It used to also ask after the intro.js overlay, which
   * dimmed the whole page; the tutorial that replaced it is a drawer page
   * beside the canvas rather than over it, and the shortcuts stay live because
   * the student is meant to be using them on the drawing while it is open.
   */
  private somethingIsOver(): boolean {
    return this.dialog.openDialogs.length > 0;
  }

  /** Whether the keystroke was aimed at somewhere text is being entered. */
  private typingInAField(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement | null;
    if (!target) return false;
    const tag = target.tagName;
    // SELECT as well as the two that take typing: a dropdown answers to the
    // keyboard the whole time it has focus -- letters jump to an option, and
    // the digits that pick a mode here are letters to it.
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  /**
   * Whether the focused thing answers this key by being what it is.
   *
   * A button is activated by Space and by Enter -- that is not a shortcut
   * anybody assigned, it is what a button is. This service answered Space
   * wherever it was pressed and called `preventDefault` on the way, which took
   * that activation away from every button in the app: reachable by keyboard,
   * focusable, outlined, and inert when pressed. Nothing noticed for as long as
   * nobody tried to drive the app without a mouse.
   *
   * Only these two keys, and only for the things that natively consume them, so
   * every other shortcut still works with a button focused.
   */
  private targetAnswersKey(event: KeyboardEvent): boolean {
    if (event.key !== ' ' && event.key !== 'Spacebar' && event.key !== 'Enter') return false;
    const target = event.target as HTMLElement | null;
    if (!target) return false;
    const tag = target.tagName;
    if (tag === 'BUTTON' || tag === 'SUMMARY') return true;
    if (tag === 'A' && target.hasAttribute('href')) return true;
    return target.getAttribute('role') === 'button';
  }
}
