import { Joint } from '../../model/joint';
import { Link } from '../../model/link';

/** Which of the two things in a drawing a row is about. */
export type PartKind = 'joint' | 'link';

/** What the file is written as. */
export type ExportFormat = 'csv' | 'xlsx' | 'images' | 'report';

/** How many digits a written number keeps. `full` writes what the solver held. */
export type Decimals = 2 | 4 | 6 | 'full';

/** Which tab of step 2 a column belongs to. */
export type ColumnTab = 'kinematics' | 'forces';

/** One tickable row of step 1: a joint or a link of one mechanism. */
export interface ExportPart {
  /** Unique across the drawing, and stable across rebuilds: `joint:A`. */
  key: string;
  kind: PartKind;
  id: string;
  label: string;
  /** Why it is worth noticing — `grounded`, `input crank`, `slider`. */
  note: string;
  /**
   * Whether this part has anything to give in the mode being exported.
   *
   * A grounded joint never moves, so kinematics has nothing for it; force
   * analysis does, because a pinned joint still carries a reaction.
   */
  available: boolean;
  part: Joint | Link;
  mechanismIndex: number;
}

/** One mechanism's worth of step 1: a heading and its rows. */
export interface ExportPartGroup {
  index: number;
  id: string;
  /** `3 links · 10.00 RPM CCW` — what this machine is, in one line. */
  note: string;
  /** Whether force analysis actually solves for this machine. */
  forcesReady: boolean;
  parts: ExportPart[];
}

/** One solved series, and everything `AnalysisSampleService` needs to take it. */
export interface ExportSeries {
  /** `Position`, `Force on Link AB` — the quantity, without the part. */
  label: string;
  /**
   * The whole phrase a column head opens with, part included.
   *
   * Set where the series names one part of its own — a reaction belongs to a
   * joint *and* a link, and neither is enough on its own. Left empty where the
   * column spans parts, and composed per part as the file is written.
   */
  head: string;
  unit: string;
  analysis: 'kinematic' | 'force';
  mechProp: string;
  /** Filled in per selected part where the column spans parts. */
  mechPart: string;
  reactionLinkId: string;
}

/**
 * One tickable row of step 2.
 *
 * A kinematic row stands for a quantity of *every* selected part of its kind —
 * ticking Position once means position for both chosen joints — so its series
 * carry no part and the writer fills one in per part. A force row names one
 * reaction of one part, and carries its own.
 */
export interface ExportColumn {
  key: string;
  label: string;
  /** Shown at the end of the row; a hint, not the head the file carries. */
  unit: string;
  /** `Centre of mass` writes three series from one tick. */
  series: ExportSeries[];
  /** Whose quantity this is: every selected joint, every selected link, or its own. */
  spans: PartKind | 'own';
  /** The part a self-owned column belongs to. Empty where the column spans parts. */
  owner: string;
  tab: ColumnTab;
}

/** A titled run of columns: `Joints B, C`, `Link AB`, `Joint A`. */
export interface ExportColumnGroup {
  key: string;
  title: string;
  tab: ColumnTab;
  columns: ExportColumn[];
}

/** One file, ready to be handed to the browser. */
export interface ExportFile {
  name: string;
  mime: string;
  /** Text content, or bytes for a format that is not text. */
  text?: string;
  bytes?: Uint8Array;
}
