import {
  Component,
  ChangeDetectionStrategy,
  DestroyRef,
  ElementRef,
  isDevMode,
  TemplateRef,
  inject,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  MatDialog,
  MatDialogRef,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
  MatDialogActions,
} from '@angular/material/dialog';
import { BackgroundImageService } from 'src/app/services/background-image.service';
import { BACKDROP_HASH, placeTemplateBackdrop } from './template-catalog';
import { LoadingService } from 'src/app/services/loading.service';
import { SvgGridService } from 'src/app/services/svg-grid.service';
import { MechanismService } from 'src/app/services/mechanism.service';
import { UrlProcessorService } from 'src/app/services/url-processor.service';
import { SynthesisBuilderService } from 'src/app/services/synthesis/synthesis-builder.service';
import { DEV_TEMPLATES, DevTemplateID } from './dev-templates';
import { TemplateID, TEMPLATE_LINKAGES } from './template-linkages';
import {
  DEV_TEMPLATE_CARDS,
  TEMPLATE_CARDS,
  TEMPLATE_CATEGORIES,
  TemplateBackdrop,
  TemplateCard,
  TemplateCategoryID,
} from './template-catalog';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { NgTemplateOutlet } from '@angular/common';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { CloseButtonComponent } from '../../BLOCKS/close-button/close-button.component';
import { ViewportService } from 'src/app/services/viewport.service';
import { TemplateCardComponent } from './template-card/template-card.component';
import { SuggestMechanismComponent } from './suggest-mechanism/suggest-mechanism.component';
import { SuggestionSentComponent } from './suggest-mechanism/suggestion-sent.component';
import { SentSuggestion, SuggestionForm } from './suggest-mechanism/suggestion';
import { SuggestionDraftService } from './suggest-mechanism/suggestion-draft.service';
import { FocusAcrossLayouts } from './focus-across-layouts';

/** A filter chip: a category, or the `all` one that stands for every category. */
export interface CategoryChip {
  id: TemplateCategoryID | 'all';
  name: string;
  /** How many cards it would show right now — which the search changes. */
  count: number;
}

/**
 * Which of the dialog's three views is up: the library itself, the Suggest a
 * Mechanism form, or the page that says a suggestion went.
 */
export type LibraryView = 'browse' | 'suggest' | 'sent';

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
  host: {
    '(focusin)': 'focusKeeper.note($event)',
    '(input)': 'focusKeeper.note($event)',
    '(keyup)': 'focusKeeper.note($event)',
    '(mouseup)': 'focusKeeper.note($event)',
    '(select)': 'focusKeeper.note($event)',
  },
  imports: [
    MatDialogClose,
    MatIcon,
    MatDialogContent,
    MatButton,
    MatDialogTitle,
    MatDialogActions,
    NgTemplateOutlet,
    CdkTrapFocus,
    CloseButtonComponent,
    TemplateCardComponent,
    SuggestMechanismComponent,
    SuggestionSentComponent,
  ],
})
export class TemplatesComponent {
  /**
   * Open the library, at the size everything opens it at.
   *
   * A static because there are three ways in now -- the project menu, the
   * tutorial card and the `?library` link -- and the first two each had their
   * own copy of the same dimensions. A library that is 90% of the window from
   * one door and something else from another is one paste away, and nothing
   * would fail.
   *
   * On a phone it is the whole window, which `.libraryDialog` says in the
   * stylesheet: at 90% of 390px the side margins were scrim nobody could use,
   * and a media query follows a phone turned on its side where a size set
   * here once would not.
   *
   * Escape and the scrim are answered by the library itself (`leave`), not by
   * the dialog: over the phone's categories they close the sheet, over the
   * form they step back to the library, and while a suggestion is on its way
   * out they do nothing at all.
   */
  static openIn(dialog: MatDialog): MatDialogRef<TemplatesComponent> {
    return dialog.open(TemplatesComponent, {
      height: '90%',
      width: '90%',
      autoFocus: false,
      disableClose: true,
      panelClass: 'libraryDialog',
    });
  }

  private dialogRef = inject<MatDialogRef<TemplatesComponent> | null>(
    MatDialogRef<TemplatesComponent>,
    { optional: true }
  );

  /** Leave without choosing anything. */
  close(): void {
    if (this.drafts.sending) return;
    this.dialogRef?.close();
  }
  private dialog = inject(MatDialog);
  private mechanismSrv = inject(MechanismService);
  private urlProcessor = inject(UrlProcessorService);
  private loading = inject(LoadingService);
  private svgGrid = inject(SvgGridService);
  private backdrop = inject(BackgroundImageService);
  private design = inject(SynthesisBuilderService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly viewport = inject(ViewportService);
  readonly drafts = inject(SuggestionDraftService);
  /** The search being typed in, given back when a phone turns. */
  readonly focusKeeper = new FocusAcrossLayouts(
    () => this.host.nativeElement,
    () => this.viewport.isPhone()
  );

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

  /** "Search 45 mechanisms": the count is how many this build offers. */
  readonly searchPlaceholder = `Search ${this.allCards.length} mechanisms`;

  view: LibraryView = 'browse';
  /** The phone's categories, raised from the Category button as a bottom sheet. */
  categorySheetOpen = false;

  /** The suggestion being written, which outlives this dialog. */
  get draft(): SuggestionForm {
    return this.drafts.form;
  }

  get lastSent(): SentSuggestion | undefined {
    return this.drafts.lastSent;
  }

  /** The button that opened the form, which gets the focus back. */
  private opener?: HTMLElement;

  constructor() {
    this.refresh();
    const destroyed = inject(DestroyRef);
    this.dialogRef
      ?.keydownEvents()
      .pipe(takeUntilDestroyed(destroyed))
      .subscribe((event) => {
        if (event.key === 'Escape') this.leave(false);
      });
    this.dialogRef
      ?.backdropClick()
      .pipe(takeUntilDestroyed(destroyed))
      .subscribe(() => this.leave(true));
  }

  /**
   * Escape, or a press on the scrim: one step out of wherever the reader is.
   *
   * The scrim does not step back from the form -- a stray click beside the
   * dialog is not a request to stop writing -- but Escape does, and from the
   * library either one closes it. Nothing typed is lost either way: the draft
   * is the session's (`SuggestionDraftService`).
   */
  private leave(scrim: boolean): void {
    if (this.drafts.sending) return;
    if (this.categorySheetOpen) this.closeCategorySheet();
    else if (this.view === 'browse') this.close();
    else if (!scrim) this.backToLibrary();
  }

  // ---------- the suggest views ----------

  /**
   * Open the form, filed under a section where the reader asked from one, and
   * titled with what they searched for where the search found nothing.
   */
  suggest(section?: TemplateCategoryID | 'all', title?: string): void {
    // A draft that has gone is not one to send again.
    if (this.lastSent) this.startOver();
    if (section && section !== 'all' && section !== 'dev') {
      this.draft.controls.section.setValue(section);
    }
    if (title?.trim() && this.draft.controls.title.value === '') {
      this.draft.controls.title.setValue(title.trim());
    }
    const focused = document.activeElement;
    this.opener = focused instanceof HTMLElement ? focused : undefined;
    this.categorySheetOpen = false;
    this.show('suggest');
  }

  /** Back to the library as it was left: same section, same search, same scroll. */
  backToLibrary(): void {
    if (this.drafts.sending) return;
    this.show('browse');
    const opener = this.opener;
    setTimeout(() => {
      // The phone's sheet is gone by now, and its Suggest button with it, and
      // a phone turned on its side has swapped the sheet's Category button for
      // the rail: the focus goes to whichever of them is there.
      const target = opener?.isConnected
        ? opener
        : this.host.nativeElement.querySelector<HTMLElement>(
            '.categoryButton, .rail .suggestCard button'
          );
      target?.focus();
    });
  }

  onSent(sent: SentSuggestion): void {
    this.drafts.lastSent = sent;
    this.show('sent');
  }

  suggestAnother(): void {
    this.startOver();
    this.show('suggest');
  }

  private startOver(): void {
    this.drafts.startOver();
  }

  /**
   * Change view, and put the focus at the top of the new one: the button that
   * was pressed to get there has gone with the old view, and focus left on a
   * removed element falls to the page.
   */
  private show(view: LibraryView): void {
    this.view = view;
    if (view === 'browse') return;
    const heading = view === 'suggest' ? '#suggestTitle' : '#sentTitle';
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(heading)?.focus());
  }

  // ---------- the phone's categories ----------

  openCategorySheet(): void {
    this.categorySheetOpen = true;
  }

  closeCategorySheet(): void {
    this.categorySheetOpen = false;
  }

  chooseFromSheet(id: TemplateCategoryID | 'all'): void {
    this.selectCategory(id);
    this.closeCategorySheet();
  }

  /** The line after the last card: this is all there is, and where to send what is not. */
  get endLine(): string {
    const query = this.query.trim();
    if (this.category === 'all') {
      return query ? `That is everything that matches “${query}”.` : 'That is the whole library.';
    }
    return query
      ? `That is everything in ${this.categoryName} that matches “${query}”.`
      : `That is everything in ${this.categoryName}.`;
  }

  /** How many cards the pressed category holds right now, for the phone's Category button. */
  get categoryCount(): number {
    return this.chips.find((chip) => chip.id === this.category)?.count ?? 0;
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
    const card = [...TEMPLATE_CARDS, ...DEV_TEMPLATE_CARDS].find((one) => one.id === linkage);
    this.choosing = card?.name ?? '';

    // An empty grid has nothing to lose, so load right here instead of
    // spawning a tab the user then has to switch to.
    if (this.gridIsEmpty()) {
      this.openHere(content, card?.backdrop);
      return;
    }

    this.dialog
      .open(this.openChoiceDialog())
      .afterClosed()
      .subscribe((choice) => {
        if (choice === 'replace') {
          this.openHere(content, card?.backdrop);
        } else if (choice === 'new-tab') {
          this.openInNewTab(content, linkage);
        }
      });
  }

  /**
   * Put the card's picture behind the mechanism, if it has one.
   *
   * After the load and never before it: opening a mechanism clears the grid,
   * and a width given in the reader's own unit means nothing until the units
   * the incoming URL carries have been applied. Failure is not worth a message
   * -- a missing backdrop costs the reader a tracing aid, not their mechanism
   * -- but it is worth the console, because a card naming an asset that is not
   * there is a mistake in the catalog rather than in anything a reader did.
   */
  private async placeBackdrop(backdrop: TemplateBackdrop | undefined): Promise<void> {
    await placeTemplateBackdrop(this.backdrop, backdrop);
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
      !this.design.hasDesign() &&
      // A picture the reader loaded counts as work on the grid. It is not in
      // the URL and not in the history, so a template that arrives with a
      // backdrop of its own replaces it *unrecoverably* -- and without this the
      // choice dialog never appeared at all on a grid that held only a picture,
      // so the file went with no question asked.
      !this.backdrop.image()
    );
  }

  private openHere(content: string, backdrop?: TemplateBackdrop) {
    // Vector switches are keyed by joint and link id, and the drawing about to
    // arrive spells its joints with the same letters as the one being replaced.
    // Left alone, a velocity vector switched on for one mechanism's B reappears
    // on a completely different mechanism's B.
    this.mechanismSrv.clearVectorTraces();
    // Closed first, so the wait is watched over the grid rather than over the
    // library the reader has already finished with.
    this.dialogRef?.close();
    // The same in-place rebuild undo/redo uses. Saved to history, so replacing
    // an existing mechanism is a single undo away from being taken back.
    //
    // Behind the cover: solving every sample of the incoming mechanism takes
    // the thread for long enough that a bare click on a card looked like a card
    // that did nothing.
    // Caught rather than left to `void`: `during` puts the cover down in its own
    // `finally`, so a throw here is already survivable on screen -- but an
    // unhandled rejection would still be the console's loudest message about a
    // load that had visibly recovered.
    this.loading
      .during(
        'Opening mechanism…',
        () => this.urlProcessor.updateFromURL(content, true, true, true),
        // Up until the new drawing is framed, not just decoded: dropped with
        // the decode, it showed the new drawing at the old one's zoom.
        () => this.svgGrid.nextFramed()
      )
      .then(() => this.placeBackdrop(backdrop))
      .catch((error) => console.error('Unable to open the mechanism', error));
  }

  private openInNewTab(content: string, linkage: TemplateID | DevTemplateID) {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const port = window.location.port;
    const url = `${protocol}//${hostname}${port ? `:${port}` : ''}${pathname}`;
    // The card's name after the hash, not in the query: the query *is* the
    // mechanism, checksum and all, and a second parameter beside it would not
    // decode. The picture itself never travels either way -- what crosses is a
    // name, and the new tab fetches the asset the catalog already ships.
    const backdrop = TEMPLATE_CARDS.find((card) => card.id === linkage)?.backdrop
      ? `#${BACKDROP_HASH}${encodeURIComponent(linkage)}`
      : '';
    const dataURLString = `${url}?${content}${backdrop}`;

    const toolman = document.createElement('a');
    toolman.setAttribute('href', dataURLString);
    toolman.setAttribute('target', '_blank');
    toolman.style.display = 'none';
    document.body.appendChild(toolman);
    toolman.click();
    document.body.removeChild(toolman);
  }
}
