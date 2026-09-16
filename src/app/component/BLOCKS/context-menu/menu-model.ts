import { MenuPosePolicy } from '../../../model/edit-permission';
/**
 * What a right-click menu is made of.
 *
 * The old menu was a flat `cMenuItem[]`: eight equally weighted rows with
 * Delete at the top, labels that rewrote themselves as the object changed
 * ("Add Ground" becoming "Remove Ground"), and three different ways of saying
 * no -- hidden here, grayed silently there, offered-and-then-refused by a
 * snackbar somewhere else.
 *
 * This is the shape the redesign asks for instead. A menu is a header naming
 * what was clicked, then a fixed ladder of groups -- Attach, State, Machine --
 * and a destructive footer, so a two-row menu and a twelve-row menu read the
 * same way and the flick to Delete always lands on the last row.
 */

/** Why a row cannot be used, in the words the model already uses. */
export interface MenuRefusal {
  /** Three or four words, shown in the row's right-hand slot. */
  short: string;
  /** The model's own sentence, on hover, where one exists. */
  long?: string;
}

export type MenuRowKind = 'action' | 'toggle';

export class MenuRow {
  /** Title Case, because it labels a control (`docs/ui-vocabulary.md`). */
  label!: string;
  /** A registered SVG icon name, or a Material Icons ligature. */
  icon!: string;
  /** Whether `icon` is a Material Icons ligature rather than a registered SVG. */
  material = false;
  kind: MenuRowKind = 'action';
  action!: () => void;
  /** For a toggle: whether the state it names is on. */
  checked = false;
  /** Set when the row is grayed. Its presence *is* the disabled flag. */
  refusal?: MenuRefusal;
  /** Keys from the shortcut registry, so a hint cannot drift from its key. */
  shortcut?: string;
  /** The footer row: red, and always last. */
  destructive = false;
  /**
   * Whether this row works away from the start pose.
   *
   * Almost nothing does: editing a mechanism parked mid-cycle would write the
   * pose it is standing in back into the drawing. The exceptions are rows that
   * do not touch the mechanism at all -- the synthesis positions are a note
   * about what it was designed for, the trace is a view of it, and crossing
   * into another mode changes nothing about the drawing.
   */
  alwaysAllowed = false;
  /** Whether this edit can preserve the original pose while paused elsewhere. */
  posePolicy: MenuPosePolicy = 'start';
  /** Per-body mapping requirements, rechecked when the row is activated. */
  poseGuard?: () => MenuRefusal | undefined;
  /** A plain-language description for the row, when the label needs help. */
  tip?: string;
  /**
   * The right-hand slot on an *available* row: a count, where one says
   * something ("6 open"), and the shortcut otherwise.
   */
  hint?: string;

  /**
   * Copied wholesale, with every default declared on the field above.
   *
   * Hand-copying each one meant a field added to the class and forgotten here
   * was dropped in silence, with the type-checker satisfied: thirty call sites
   * pass a `Partial`, the builder would set the new thing, and the row would
   * never see it.
   */
  constructor(init: Partial<MenuRow> & Pick<MenuRow, 'label' | 'icon' | 'action'>) {
    Object.assign(this, init);
  }

  get disabled(): boolean {
    return !!this.refusal;
  }

  /** The dark chip on hover: the model's sentence, or the row's own note. */
  get hoverText(): string {
    return this.refusal?.long ?? this.tip ?? '';
  }
}

/** One value of a choice: a glyph, a label, and what choosing it does. */
export interface MenuChoiceOption {
  label: string;
  /** A registered SVG icon name. */
  icon: string;
  /** Set when this value cannot be chosen. Its presence *is* the disabled flag. */
  refusal?: MenuRefusal;
  action: () => void;
}

/**
 * A choice the card offers above its rows, as a grid of values.
 *
 * A joint's type is the one of these (D8 of
 * `docs/joint-type-and-cylinder-plan.md`): four values that were two switches
 * down in State, where between them they hid what a joint can be. A grid
 * rather than rows, because the four are one question and a reader picking one
 * is not reading a list.
 */
export interface MenuChoice {
  /** Names the set, for a reader who cannot see that it is one. */
  label: string;
  options: MenuChoiceOption[];
  /** Which value is chosen, or -1 where a group's parts disagree. */
  chosen: number;
  /** The chosen value cannot stand as drawn -- a block with nowhere to slide. */
  fault?: MenuRefusal;
  /** What the choice needs of the pose, as a row states it. */
  posePolicy: MenuPosePolicy;
}

/** One rung of the ladder. The label is dropped on an unlabeled footer. */
export interface MenuGroup {
  /** Upper-cased in the stylesheet; written here as a plain word. */
  label?: string;
  rows: MenuRow[];
}

/** The way out of this mode, as one icon beside the target's name. */
export interface MenuCrossing {
  icon: string;
  material?: boolean;
  /** Tooltip, with the mode's shortcut on the end. */
  tip: string;
  refusal?: MenuRefusal;
  action: () => void;
}

/** Who the menu is about: "Joint B", "Pin · Links AB, BC". */
export interface MenuHeader {
  title: string;
  subtitle: string;
  crossing?: MenuCrossing;
}

export interface ContextMenuModel {
  header?: MenuHeader;
  /** Above the ladder: the values the part itself can be. */
  choice?: MenuChoice;
  groups: MenuGroup[];
}

/** Whether there is anything at all to show. */
export function menuIsEmpty(model: ContextMenuModel): boolean {
  return !model.choice && model.groups.every((group) => group.rows.length === 0);
}

/**
 * Where the last right-click was, in client coordinates.
 *
 * The menu wants this so the card can grow from the corner the pointer is in,
 * and it cannot ask the canvas for it: the CDK's own `contextmenu` listener
 * runs before the template's, so by the time the canvas has recorded the point
 * the card has already been created and measured. A capture-phase listener,
 * installed once at start-up, is ahead of both.
 */
let lastPointer = { x: 0, y: 0 };
let lastWasKeyboard = false;
let tracking = false;

export function trackContextMenuPointer(): void {
  if (tracking || typeof document === 'undefined') return;
  tracking = true;
  document.addEventListener(
    'contextmenu',
    (event) => {
      lastPointer = { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY };
      // The right button names itself; the context-menu key and Shift-F10 send
      // the same event with button 0. A held finger is a right-click here too,
      // because `onLongPress` dispatches one with `button: 2` -- so this is the
      // one question that separates a reader who pointed from one who typed.
      lastWasKeyboard = (event as MouseEvent).button !== 2;
    },
    true
  );
}

export function lastContextMenuPointer(): { x: number; y: number } {
  return lastPointer;
}

/**
 * Whether the card standing open was opened from the keyboard.
 *
 * Which decides whether the focus the CDK moves into it is *drawn*. See
 * `ContextMenuComponent.byKeyboard`.
 */
export function lastContextMenuWasKeyboard(): boolean {
  return lastWasKeyboard;
}
