import {
  Component,
  ChangeDetectionStrategy,
  isDevMode,
  TemplateRef,
  inject,
  viewChild,
} from '@angular/core';
import {
  MatDialog,
  MatDialogRef,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
  MatDialogActions,
} from '@angular/material/dialog';
import { MechanismService } from 'src/app/services/mechanism.service';
import { UrlProcessorService } from 'src/app/services/url-processor.service';
import { SynthesisBuilderService } from 'src/app/services/synthesis/synthesis-builder.service';
import { DEV_TEMPLATES, DevTemplateID } from './dev-templates';
import { TemplateID, TEMPLATE_LINKAGES } from './template-linkages';
import {
  DEV_TEMPLATE_CARDS,
  TEMPLATE_CARDS,
  TEMPLATE_CATEGORIES,
  TemplateCard,
  TemplateCategoryID,
} from './template-catalog';
import { MatIconButton, MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { CdkScrollable } from '@angular/cdk/scrolling';

/** A filter chip: a category, or the `all` one that stands for every category. */
export interface CategoryChip {
  id: TemplateCategoryID | 'all';
  name: string;
  /** How many cards it would show right now — which the search changes. */
  count: number;
}

/** One heading and the cards under it. */
export interface TemplateGroup {
  id: TemplateCategoryID;
  name: string;
  cards: TemplateCard[];
}

@Component({
  selector: 'app-templates',
  templateUrl: './templates.component.html',
  styleUrls: ['./templates.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    MatIconButton,
    MatDialogClose,
    MatIcon,
    CdkScrollable,
    MatDialogContent,
    MatButton,
    MatDialogTitle,
    MatDialogActions,
  ],
})
export class TemplatesComponent {
  private dialogRef = inject<MatDialogRef<TemplatesComponent> | null>(
    MatDialogRef<TemplatesComponent>,
    { optional: true }
  );
  private dialog = inject(MatDialog);
  private mechanismSrv = inject(MechanismService);
  private urlProcessor = inject(UrlProcessorService);
  private design = inject(SynthesisBuilderService);

  /** Asks whether to replace the mechanism already on the grid or open a new tab. */
  readonly openChoiceDialog = viewChild.required<TemplateRef<unknown>>('openChoiceDialog');

  /** Every card this build offers, in catalog order. */
  private readonly allCards: readonly TemplateCard[] = isDevMode()
    ? [...DEV_TEMPLATE_CARDS, ...TEMPLATE_CARDS]
    : TEMPLATE_CARDS;

  /** Which chip is pressed. `all` shows every group at once. */
  category: TemplateCategoryID | 'all' = 'all';
  query = '';

  chips: CategoryChip[] = [];
  groups: TemplateGroup[] = [];

  constructor() {
    this.refresh();
  }

  selectCategory(id: TemplateCategoryID | 'all') {
    this.category = id;
    this.refresh();
  }

  setQuery(event: Event) {
    this.query = (event.target as HTMLInputElement).value;
    this.refresh();
  }

  clearQuery() {
    this.query = '';
    this.refresh();
  }

  /**
   * Escape empties the search rather than closing the library — but only while
   * there is something to empty, so a reader who has not typed anything still
   * gets the one Escape they expect.
   */
  escapeSearch(event: Event) {
    if (this.query === '') return;
    event.stopPropagation();
    this.clearQuery();
  }

  showEverything() {
    this.category = 'all';
    this.clearQuery();
  }

  /** Total cards on screen, so the dialog can say when there are none. */
  get shown(): number {
    return this.groups.reduce((total, group) => total + group.cards.length, 0);
  }

  /** The pressed chip's name, for the line shown when it matches nothing. */
  get categoryName(): string {
    return this.chips.find((chip) => chip.id === this.category)?.name ?? 'All';
  }

  /**
   * Rebuilds the chips and the groups from the catalog.
   *
   * Run on every keystroke rather than filtered in the template: the counts on
   * the chips answer the search too, so they and the list have to be derived
   * from the same pass or a chip can promise cards the list does not show.
   */
  private refresh() {
    const matching = this.allCards.filter((card) => this.matches(card));

    this.chips = [{ id: 'all', name: 'All', count: matching.length }];
    this.groups = [];

    for (const category of TEMPLATE_CATEGORIES) {
      // A category nothing is filed under is not a category yet: no chip, no
      // heading. That is what lets one be declared before its first mechanism.
      if (!this.allCards.some((card) => card.category === category.id)) continue;

      const cards = matching.filter((card) => card.category === category.id);
      this.chips.push({ id: category.id, name: category.name, count: cards.length });

      if (cards.length > 0 && (this.category === 'all' || this.category === category.id)) {
        this.groups.push({ id: category.id, name: category.name, cards });
      }
    }
  }

  /** Name, description and family are all worth searching; the id is not. */
  private matches(card: TemplateCard): boolean {
    const query = this.query.trim().toLowerCase();
    if (query === '') return true;

    const family = TEMPLATE_CATEGORIES.find((entry) => entry.id === card.category)?.name ?? '';
    return `${card.name} ${card.description} ${family}`.toLowerCase().includes(query);
  }

  /**
   * The mechanism the choice dialog is about.
   *
   * The dialog names it in its own title, which is what lets the sentence
   * underneath stop carrying every piece of information at once.
   */
  choosing = '';

  openLinkage(linkage: TemplateID | DevTemplateID) {
    const content =
      linkage in DEV_TEMPLATES
        ? DEV_TEMPLATES[linkage as DevTemplateID]
        : TEMPLATE_LINKAGES[linkage as TemplateID];
    this.choosing =
      [...TEMPLATE_CARDS, ...DEV_TEMPLATE_CARDS].find((card) => card.id === linkage)?.name ?? '';

    // An empty grid has nothing to lose, so load right here instead of
    // spawning a tab the user then has to switch to.
    if (this.gridIsEmpty()) {
      this.openHere(content);
      return;
    }

    this.dialog
      .open(this.openChoiceDialog())
      .afterClosed()
      .subscribe((choice) => {
        if (choice === 'replace') {
          this.openHere(content);
        } else if (choice === 'new-tab') {
          this.openInNewTab(content);
        }
      });
  }

  /**
   * Whether there is nothing here to lose.
   *
   * A synthesis design counts. Positions persist after the tab is left and are
   * cleared by the template's own load, so a reader who has drawn three of them
   * but inserted nothing yet was having them thrown away with no warning at all.
   */
  private gridIsEmpty(): boolean {
    return (
      this.mechanismSrv.joints.length === 0 &&
      this.mechanismSrv.links.length === 0 &&
      this.mechanismSrv.forces.length === 0 &&
      !this.design.hasDesign()
    );
  }

  private openHere(content: string) {
    // The same in-place rebuild undo/redo uses. Saved to history, so replacing
    // an existing mechanism is a single undo away from being taken back.
    this.urlProcessor.updateFromURL(content, true, true, true);
    this.dialogRef?.close();
  }

  private openInNewTab(content: string) {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const port = window.location.port;
    const url = `${protocol}//${hostname}${port ? `:${port}` : ''}${pathname}`;
    const dataURLString = `${url}?${content}`;

    const toolman = document.createElement('a');
    toolman.setAttribute('href', dataURLString);
    toolman.setAttribute('target', '_blank');
    toolman.style.display = 'none';
    document.body.appendChild(toolman);
    toolman.click();
    document.body.removeChild(toolman);
  }
}
