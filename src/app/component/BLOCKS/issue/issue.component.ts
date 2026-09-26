import { ChangeDetectionStrategy, Component, computed, input, OnInit, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { fixesLabel, SetupIssue, toggleLabel } from '../../../model/mechanism/setup-issue';
import { ProseComponent } from '../prose/prose.component';

let panels = 0;

/**
 * One thing standing between a drawing and its analysis: what is wrong, always
 * on screen, and how to fix it, behind "Show fixes".
 *
 * The title and summary are what a reader scans a list by, so they are all a
 * list of several shows at first. The rule behind the problem and the edits to
 * try open directly under the button that asked for them, and stay open until
 * it is pressed again -- for as long as the list is on screen. An issue alone in
 * its list has nothing to be scanned past, so it can start open (`startOpen`).
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
export class IssueComponent implements OnInit {
  readonly issue = input.required<SetupIssue>();
  /**
   * Open when it first appears: an issue alone in its list. Read once, so a
   * second issue arriving later does not shut the one the reader is reading.
   */
  readonly startOpen = input(false);

  protected readonly open = signal(false);
  protected readonly panelId = `issuePanel${++panels}`;

  protected readonly icon = computed(() => {
    const severity = this.issue().severity;
    return severity === 'blocker' ? 'error' : severity === 'warning' ? 'warning' : 'scatter_plot';
  });
  protected readonly label = computed(() => fixesLabel(this.issue()));
  protected readonly isOpen = computed(() => this.open());
  protected readonly toggleText = computed(() => toggleLabel(this.issue(), this.isOpen()));

  ngOnInit(): void {
    this.open.set(this.startOpen());
  }

  protected toggle(): void {
    this.open.update((open) => !open);
  }
}
