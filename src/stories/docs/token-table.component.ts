import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/** What a sample cell can draw for a value. */
type TokenKind = 'color' | 'shadow' | 'radius' | 'length' | 'other';

/** One declaration of one custom property. */
export interface TokenRow {
  name: string;
  /** The value as written in the stylesheet. */
  declared: string;
  /** The value the document actually resolves, after every later declaration. */
  inEffect: string;
  /** The stylesheet it came from. */
  source: string;
  /** Any `@media` or `@supports` it sits inside, or '' at the top level. */
  context: string;
  kind: TokenKind;
}

export interface TokenReading {
  /** Declared by the app's own stylesheets. */
  app: TokenRow[];
  /** Declared by Angular Material's theme mixins. */
  material: TokenRow[];
  sheetsRead: number;
  unreadable: string[];
}

/**
 * Every custom property declared on the root element -- `:root`, or `html`,
 * which is the same element -- in the stylesheets this document has loaded.
 *
 * Read from `document.styleSheets` rather than from a list, so the page cannot
 * go stale: whatever the app's build adds to its global styles is here the
 * next time the page opens. A sheet from another origin -- the Google Fonts
 * stylesheet -- refuses to be read, and is reported rather than skipped.
 *
 * Material's theme mixins write dozens of `--mat-*` tokens onto the same
 * element, and every stylesheet here arrives as one bundle, so the file cannot
 * tell them apart. The rule can: a rule Material generated declares nothing but
 * `--mat-*` properties, while a rule written in this app declares its own names
 * too (which is how `--mat-warning-color`, written in `src/styles.scss` beside
 * `--border-radius`, stays with the app's tokens).
 */
export function readTokens(doc: Document): TokenReading {
  const reading: TokenReading = { app: [], material: [], sheetsRead: 0, unreadable: [] };
  const computed = getComputedStyle(doc.documentElement);

  const visitRules = (rules: CSSRuleList, source: string, context: string): void => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSImportRule) {
        if (rule.styleSheet) visitSheet(rule.styleSheet);
        continue;
      }
      if (rule instanceof CSSStyleRule) {
        const selectors = rule.selectorText.split(',').map((one) => one.trim());
        const names = Array.from(rule.style).filter((name) => name.startsWith('--'));
        if (names.length && (selectors.includes(':root') || selectors.includes('html'))) {
          const bucket = names.every((name) => name.startsWith('--mat-'))
            ? reading.material
            : reading.app;
          for (const name of names) {
            const declared = rule.style.getPropertyValue(name).trim();
            const inEffect = computed.getPropertyValue(name).trim();
            bucket.push({
              name,
              declared,
              inEffect,
              source,
              context,
              kind: kindOf(name, inEffect || declared),
            });
          }
        }
      }
      // Media, supports and layer blocks carry rules of their own, and so does
      // a style rule with nested rules inside it.
      const children = (rule as CSSGroupingRule).cssRules;
      if (children?.length) {
        const condition =
          rule instanceof CSSMediaRule
            ? `@media ${rule.conditionText}`
            : rule instanceof CSSSupportsRule
              ? `@supports ${rule.conditionText}`
              : '';
        visitRules(children, source, [context, condition].filter(Boolean).join(' '));
      }
    }
  };

  const visitSheet = (sheet: CSSStyleSheet): void => {
    const source = sourceOf(sheet);
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      reading.unreadable.push(source);
      return;
    }
    reading.sheetsRead++;
    visitRules(rules, source, '');
  };

  for (const sheet of Array.from(doc.styleSheets)) visitSheet(sheet);
  return reading;
}

function sourceOf(sheet: CSSStyleSheet): string {
  if (sheet.href) {
    const url = new URL(sheet.href);
    return url.pathname.split('/').pop() || url.host;
  }
  const owner = sheet.ownerNode as HTMLElement | null;
  const viteId = owner?.getAttribute?.('data-vite-dev-id');
  if (viteId) return viteId.split('/').slice(-2).join('/');
  return 'inline <style>';
}

/** A heading's worth of tokens: one role, described once. */
export interface TokenGroup {
  title: string;
  about: string;
  rows: TokenRow[];
}

/**
 * The roles, in the order the token file lists them. A token joins the first
 * role whose test it passes, so `--border-radius` is a shape before it is a
 * border and `--card-surface` a surface before it is a card.
 */
const ROLES: { title: string; about: string; test: (name: string) => boolean }[] = [
  {
    title: 'Shape',
    about: 'The radii, the gap and the shadows every card and menu shares.',
    test: (n) => /(radius|shadow|gap)$/.test(n),
  },
  {
    title: 'Surfaces',
    about: 'What things sit on: the card, the panels under it, fields, wells and a hovered row.',
    test: (n) => /^--(surface|card-surface|switch-)/.test(n),
  },
  {
    title: 'Borders',
    about: 'Hairlines and dividers.',
    test: (n) => n.startsWith('--border'),
  },
  {
    title: 'Text',
    about: 'The tiers of ink, from a value to read down to a control that cannot be used.',
    test: (n) => n.startsWith('--text'),
  },
  {
    title: 'Brand',
    about: "Material indigo: the app's own color, from the filled button to the faintest wash.",
    test: (n) => n.startsWith('--brand'),
  },
  {
    title: 'Selection',
    about: 'A switch or chip that is on, and a row that is chosen.',
    test: (n) => n.startsWith('--selection'),
  },
  {
    title: 'Accent',
    about: 'Material amber: the selection ring on the drawing, highlights and guides.',
    test: (n) => n.startsWith('--accent'),
  },
  {
    title: 'Warning',
    about: 'Needs attention, does not block.',
    test: (n) => n.startsWith('--warning'),
  },
  {
    title: 'Refusal',
    about: 'Blocks, destroys or failed. The neutral one is a gesture refused on purpose.',
    test: (n) => /^--(danger|refusal|mat-warning-color)/.test(n),
  },
  {
    title: 'Success',
    about: 'Done, and ready.',
    test: (n) => n.startsWith('--success'),
  },
  {
    title: 'Canvas',
    about: "The SVG drawing's own marks: ink, the halo behind a label, an inert part.",
    test: (n) => n.startsWith('--canvas'),
  },
];

export function groupTokens(rows: TokenRow[]): TokenGroup[] {
  const groups = ROLES.map((role) => ({
    title: role.title,
    about: role.about,
    rows: [] as TokenRow[],
  }));
  const other: TokenGroup = { title: 'Other', about: 'Named, but in no role above.', rows: [] };
  for (const row of rows) {
    const at = ROLES.findIndex((role) => role.test(row.name));
    (at >= 0 ? groups[at] : other).rows.push(row);
  }
  return [...groups, other].filter((group) => group.rows.length > 0);
}

function kindOf(name: string, value: string): TokenKind {
  if (!value || typeof CSS === 'undefined') return 'other';
  if (/shadow/i.test(name) && CSS.supports('box-shadow', value)) return 'shadow';
  if (/radius/i.test(name) && CSS.supports('border-radius', value)) return 'radius';
  if (!/^-?[\d.]+$/.test(value) && CSS.supports('color', value)) return 'color';
  if (/^-?\d*\.?\d+(px|rem|em|%|vh|vw)$/.test(value)) return 'length';
  return 'other';
}

/**
 * The Tokens docs page's table.
 *
 * Gallery chrome, not an app component: it lives beside the docs page that
 * shows it, and nothing in `src/app` imports it.
 */
@Component({
  selector: 'sb-token-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  template: `
    <section class="tokens">
      <div class="bar">
        <span>
          <strong>{{ reading().app.length }}</strong> app tokens on <code>:root</code>, read from
          {{ reading().sheetsRead }} stylesheets
        </span>
        <button type="button" (click)="refresh()">Read again</button>
      </div>

      @if (reading().app.length === 0) {
        <p class="empty">The app declares no custom properties on <code>:root</code> yet.</p>
      } @else {
        <nav class="roles">
          @for (group of groups(); track group.title) {
            <a [href]="'#tokens-' + group.title.toLowerCase()"
              >{{ group.title }} ({{ group.rows.length }})</a
            >
          }
        </nav>
        @for (group of groups(); track group.title) {
          <section class="app-tokens" [id]="'tokens-' + group.title.toLowerCase()">
            <h3>{{ group.title }}</h3>
            <p class="about">{{ group.about }}</p>
            <ng-container *ngTemplateOutlet="table; context: { $implicit: group.rows }" />
          </section>
        }
      }

      <details>
        <summary>
          Angular Material's own tokens on the same element ({{ reading().material.length }})
        </summary>
        <ng-container *ngTemplateOutlet="table; context: { $implicit: reading().material }" />
      </details>

      @if (reading().unreadable.length) {
        <p class="note">
          Not readable from this page (another origin): {{ reading().unreadable.join(', ') }}
        </p>
      }
    </section>

    <ng-template #table let-rows>
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th>Sample</th>
              <th>Name</th>
              <th>In effect</th>
              <th>Declared in</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows; track $index) {
              <tr [attr.data-token]="row.name">
                <td class="sample">
                  @switch (row.kind) {
                    @case ('color') {
                      <span class="swatch" [style.background]="row.inEffect"></span>
                    }
                    @case ('shadow') {
                      <span class="shadow" [style.box-shadow]="row.inEffect"></span>
                    }
                    @case ('radius') {
                      <span class="radius" [style.border-radius]="row.inEffect"></span>
                    }
                    @case ('length') {
                      <span class="length" [style.width]="row.inEffect"></span>
                    }
                  }
                </td>
                <td>
                  <code>{{ row.name }}</code>
                </td>
                <td>
                  <code>{{ row.inEffect }}</code>
                  @if (row.declared !== row.inEffect) {
                    <div class="declared">
                      written <code>{{ row.declared }}</code>
                    </div>
                  }
                </td>
                <td class="where">
                  {{ row.source }}
                  @if (row.context) {
                    <div class="declared">{{ row.context }}</div>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </ng-template>
  `,
  styles: `
    .tokens {
      font-family: Roboto, 'Helvetica Neue', sans-serif;
      font-size: 13px;
      color: rgba(0, 0, 0, 0.87);
      padding: 4px 0 16px;
    }
    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
    }
    .bar button {
      font: inherit;
      padding: 4px 10px;
      cursor: pointer;
    }
    .roles {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      margin: 4px 0 12px;
    }
    .roles a {
      color: inherit;
    }
    h3 {
      margin: 20px 0 2px;
      font-size: 15px;
      font-weight: 500;
    }
    .about {
      margin: 0 0 6px;
      color: rgba(0, 0, 0, 0.6);
    }
    .scroll {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      text-align: left;
      vertical-align: middle;
      padding: 8px 10px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    }
    th {
      font-weight: 500;
      color: rgba(0, 0, 0, 0.6);
    }
    code {
      font-size: 12px;
      word-break: break-word;
    }
    .sample {
      width: 72px;
    }
    .swatch,
    .shadow,
    .radius {
      display: block;
      width: 48px;
      height: 28px;
      box-sizing: border-box;
    }
    .swatch {
      border: 1px solid rgba(0, 0, 0, 0.15);
      border-radius: 4px;
    }
    .shadow {
      background: var(--card-surface, #fff);
      border-radius: 4px;
    }
    .radius {
      border: 2px solid rgba(0, 0, 0, 0.45);
    }
    .length {
      display: block;
      max-width: 64px;
      height: 6px;
      background: rgba(0, 0, 0, 0.45);
    }
    .declared,
    .where,
    .note,
    .empty {
      color: rgba(0, 0, 0, 0.6);
    }
    details {
      margin-top: 16px;
    }
    summary {
      cursor: pointer;
      padding: 6px 0;
    }
  `,
})
export class TokenTableComponent {
  readonly reading = signal<TokenReading>({ app: [], material: [], sheetsRead: 0, unreadable: [] });
  readonly groups = computed(() => groupTokens(this.reading().app));
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // Once after the first render, and once more a moment later: in the dev
    // server the global stylesheets are injected by script and can arrive
    // after this page has drawn.
    afterNextRender(() => {
      this.refresh();
      const later = setTimeout(() => this.refresh(), 600);
      this.destroyRef.onDestroy(() => clearTimeout(later));
    });
  }

  refresh(): void {
    this.reading.set(readTokens(document));
  }
}
