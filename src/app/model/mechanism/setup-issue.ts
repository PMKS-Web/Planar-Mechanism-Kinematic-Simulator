import { Prose, textOf } from '../prose';

/**
 * One thing standing between a drawing and its analysis, as the setup drawers
 * show it (`docs/setup-issues-spec.md`).
 *
 * Split by the question each part answers, because one paragraph answering all
 * four is what the drawer used to show and what a first-year student skimmed
 * past: the title says what is wrong, the summary why it is a problem in this
 * drawing, the explanation the rule behind it, and each fix one edit to try.
 * Only the first two are on screen until the reader asks for the rest.
 */

/** Blockers stop the analysis, warnings do not, and unassigned parts are left out of it. */
export type IssueSeverity = 'blocker' | 'warning' | 'unassigned';

export interface SetupIssue {
  severity: IssueSeverity;
  /** What is wrong, in 3 to 7 words. Sentence case, no final period. */
  title: string;
  /** The one fact that makes it a problem in this drawing. */
  summary: Prose;
  /** The rule behind the problem, true of any drawing: it names no parts. */
  explain: string;
  /** Edits to try, most likely first, three at most. */
  fixes: Prose[];
  /** What to expect when nothing needs changing. Only with no fixes. */
  note?: string;
}

/** The most fixes an issue lists. Past three a list stops being a choice. */
export const MOST_FIXES = 3;

/**
 * The most a list of steps holds, where the drawing needs one edit for each of
 * several loose parts rather than one edit of several: two ways for each of
 * two loose links.
 */
export const MOST_STEPS = 4;

/** What the title and summary say together, for a surface with room for one line. */
export function issueText(issue: SetupIssue): string {
  return `${issue.title}. ${textOf(issue.summary)}`;
}

/**
 * The line over the fixes, which says whether they are needed and presents
 * them as suggestions. Exact strings, from the spec's table.
 */
export function fixesLabel(issue: SetupIssue): string {
  const count = issue.fixes.length;
  const lead =
    issue.severity === 'blocker'
      ? 'Required to run.'
      : issue.severity === 'warning'
        ? 'Optional, it runs as is.'
        : 'Optional, analysis skips it for now.';
  if (count === 0) return lead;
  if (issue.severity === 'blocker') {
    return `${lead} ${count === 1 ? 'One way to fix it:' : 'Some ways to fix it:'}`;
  }
  return `${lead} ${count === 1 ? 'Something to try:' : 'Some things to try:'}`;
}

/** The toggle under the summary: fixes when there are any, the rest otherwise. */
export function toggleLabel(issue: SetupIssue, open: boolean): string {
  if (issue.fixes.length === 0) return open ? 'Show less' : 'Show more';
  return open ? 'Hide fixes' : 'Show fixes';
}
