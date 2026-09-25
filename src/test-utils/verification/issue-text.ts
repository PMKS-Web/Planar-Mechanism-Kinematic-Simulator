import { SetupIssue } from '../../app/model/mechanism/setup-issue';
import { isPart, textOf } from '../../app/model/prose';

/**
 * An issue as a reader reads it, in plain text, with the parts its summary and
 * fixes link to: what a spec pins.
 */
export function read(issue: SetupIssue) {
  return {
    severity: issue.severity,
    title: issue.title,
    summary: textOf(issue.summary),
    explain: issue.explain,
    fixes: issue.fixes.map(textOf),
    note: issue.note,
    /** Every part a link in the summary or a fix goes to, by id. */
    parts: [...issue.summary, ...issue.fixes.flat()].filter(isPart).map((piece) => piece.part.id),
  };
}
