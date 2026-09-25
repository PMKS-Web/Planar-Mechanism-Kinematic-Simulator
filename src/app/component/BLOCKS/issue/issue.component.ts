import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { fixesLabel, SetupIssue, toggleLabel } from '../../../model/mechanism/setup-issue';
import { ProseComponent } from '../prose/prose.component';

let panels = 0;

/**
 * One thing standing between a drawing and its analysis: what is wrong, always
 * on screen, and how to fix it, behind "Show fixes".
 *
 * The title and summary are what a reader scans a list by, so they are all the
 * list shows at first. The rule behind the problem and the edits to try open
 * directly under the button that asked for them, and stay open until it is
 * pressed again -- for as long as the list is on screen.
 *
 * Color is the icon's and nobody else's: a title in red reads as shouting, and
 * says nothing the icon beside it has not.
 */
@Component({
  selector: 'issue-block',
  templateUrl: './issue.component.html',
  styleUrls: ['./issue.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, ProseComponent],
})
export class IssueComponent {
  readonly issue = input.required<SetupIssue>();
  /** Open from the start, for a gallery story that shows the panel. */
  readonly startOpen = input(false);

  protected readonly open = signal(false);
  protected readonly panelId = `issuePanel${++panels}`;

  protected readonly icon = computed(() => {
    const severity = this.issue().severity;
    return severity === 'blocker' ? 'error' : severity === 'warning' ? 'warning' : 'scatter_plot';
  });
  protected readonly label = computed(() => fixesLabel(this.issue()));
  protected readonly isOpen = computed(() => this.open() !== this.startOpen());
  protected readonly toggleText = computed(() => toggleLabel(this.issue(), this.isOpen()));

  protected toggle(): void {
    this.open.update((open) => !open);
  }
}
