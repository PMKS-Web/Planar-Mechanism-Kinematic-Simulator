import { Injectable, inject } from '@angular/core';
import { LengthUnit } from '../../model/unit-enums';
import { MachineFactSheet, machineFactSheets } from '../../model/what-is-this/machine-sheet';
import { noteVocabulary, PanelNote, panelNote } from '../../model/what-is-this/note-prose';
import { WhatIsThisReply } from '../../model/what-is-this/prompt';
import { BackgroundImageService } from '../background-image.service';
import { DragStateService } from '../drag-state.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { NoteStore } from './note-store';
import { WhatIsThisPictureService } from './what-is-this-picture.service';

/** Where the Netlify Function answers (`netlify/functions/what-is-this.mts`). */
export const WHAT_IS_THIS_ENDPOINT = '/api/what-is-this';

/** How long "busy" lasts when nobody says: Gemini's quotas are per minute. */
const BUSY_FOR_MS = 60_000;

/**
 * Where one machine's note stands.
 *
 * - `cannot-run`: PMKS+ describes a machine once it runs, so there is no sheet.
 * - `unsolved`: a drawing large enough that Edit puts its solve off until an
 *   analysis or Play asks for it, so whether it runs is not known yet.
 * - `unwritten`: never asked for since the machine last changed.
 * - `writing`, `failed`, `busy` (rate-limited, until `retryAt`), `written`.
 */
export type NoteStatus =
  'cannot-run' | 'unsolved' | 'unwritten' | 'writing' | 'failed' | 'busy' | 'written';

export interface MachineNote {
  status: NoteStatus;
  sheet?: MachineFactSheet;
  /** This sheet's note, or the one written before the machine last changed. */
  note?: PanelNote;
  /** The note is from before the last edit, so it may no longer match. */
  stale: boolean;
  /** Busy until then, in milliseconds since the epoch. */
  retryAt?: number;
}

/** A request under way or ended without a note, by the key of the sheet it was for. */
interface Asking {
  status: 'writing' | 'failed' | 'busy';
  retryAt?: number;
}

/**
 * "What is this?": the fact sheet for each machine, and the note written from
 * it.
 *
 * PMKS+ works out the facts (`model/what-is-this/`), a model only puts them
 * into words, and a note is filed under its sheet's key, so the same machine
 * is never asked about twice: not in this browser, and not at all for the
 * library, whose notes ship with the app. docs/what-is-this-shipping.md is the
 * design.
 */
@Injectable({ providedIn: 'root' })
export class WhatIsThisService {
  private mechanism = inject(MechanismService);
  private settings = inject(SettingsService);
  private backdrop = inject(BackgroundImageService);
  private dragState = inject(DragStateService);
  private picture = inject(WhatIsThisPictureService);

  private store = new NoteStore();
  private asking = new Map<string, Asking>();
  /** Notes drawn from replies, by key, since the panel asks on every check. */
  private drawn = new Map<string, PanelNote>();
  /** The last note each machine showed, to keep in view, faded, after an edit. */
  private earlier = new Map<number, { note: PanelNote; joints: Set<string> }>();
  private sheetCache?: { key: string; sheets: MachineFactSheet[] };

  /**
   * A sheet for each machine that runs. Worked out again only when the solve
   * or something the sheet quotes changes, and not while a drag is under way:
   * a straight-line linkage's sheet takes a tenth of a second.
   */
  sheets(): MachineFactSheet[] {
    const fileName = this.backdrop.image()?.fileName;
    const key = [
      this.mechanism.solveRevision,
      fileName ?? '',
      this.settings.lengthUnit.value,
      this.settings.inputSpeed.value,
      this.settings.linearInputSpeed.value,
      this.settings.isInputCW.value,
    ].join('|');
    if (this.sheetCache && (this.sheetCache.key === key || this.dragState.isDragging)) {
      return this.sheetCache.sheets;
    }
    const unit = this.settings.lengthUnit.value;
    const sheets = machineFactSheets({
      partitions: this.mechanism.partitions,
      mechanisms: this.mechanism.mechanisms,
      lengthUnit: unit === LengthUnit.INCH ? 'in' : unit === LengthUnit.METER ? 'm' : 'cm',
      defaultRpm: this.settings.inputSpeed.value,
      defaultLinearSpeed: this.settings.linearInputSpeed.value,
      defaultClockwise: this.settings.isInputCW.value,
      backdrop: fileName === undefined ? undefined : { fileName },
    });
    this.sheetCache = { key, sheets };
    return sheets;
  }

  sheetFor(index: number): MachineFactSheet | undefined {
    return this.sheets().find((sheet) => sheet.index === index);
  }

  noteFor(index: number): MachineNote {
    if (this.mechanism.solvingIsDeferred) return { status: 'unsolved', stale: false };
    const sheet = this.sheetFor(index);
    if (!sheet) return { status: 'cannot-run', stale: false };
    const note = this.noteOf(sheet);
    if (note) {
      this.earlier.set(index, { note, joints: new Set(sheet.partNames.joints) });
      return { status: 'written', sheet, note, stale: false };
    }
    const earlier = this.earlier.get(index);
    // The same machine if it kept any of its joints: a deletion renumbers the
    // machines, and another machine's note would be worse than none.
    const kept =
      earlier && sheet.partNames.joints.some((joint) => earlier.joints.has(joint))
        ? earlier.note
        : undefined;
    const asking = this.asking.get(sheet.key);
    return {
      status: asking?.status ?? 'unwritten',
      sheet,
      note: kept,
      stale: !!kept,
      retryAt: asking?.retryAt,
    };
  }

  /**
   * Write the note when the section first shows a machine nobody has asked
   * about. After an edit it waits to be asked: the earlier note stays, faded,
   * and a reader tuning a length should not spend a request on every step.
   */
  offer(index: number): void {
    const state = this.noteFor(index);
    if (state.status !== 'unwritten' || state.stale || this.dragState.isDragging) return;
    void this.write(index);
  }

  /** Ask for this machine's note: from the library if it has one, else from the model. */
  async write(index: number): Promise<void> {
    const sheet = this.sheetFor(index);
    if (!sheet || this.asking.get(sheet.key)?.status === 'writing') return;
    const key = sheet.key;
    this.asking.set(key, { status: 'writing' });
    try {
      await this.store.loadLibrary();
      // Out of change detection before the picture renders the app, and a
      // chance for an edit that was already on its way to land.
      await new Promise((resolve) => setTimeout(resolve));
      if (this.store.get(key) || this.sheetFor(index)?.key !== key) {
        this.asking.delete(key);
        return;
      }
      const picture = await this.picture
        .capture(index, sheet.moments, sheet.backdropTile)
        .catch(() => undefined);
      const response = await fetch(WHAT_IS_THIS_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sheet: sheet.text, picture }),
      });
      if (response.status === 429) {
        const seconds = Number(response.headers.get('retry-after'));
        const wait = seconds > 0 ? seconds * 1000 : BUSY_FOR_MS;
        this.asking.set(key, { status: 'busy', retryAt: Date.now() + wait });
        return;
      }
      const reply = response.ok ? replyIn(await response.json()) : undefined;
      if (!reply) {
        this.asking.set(key, { status: 'failed' });
        return;
      }
      this.store.keep(key, reply);
      this.asking.delete(key);
    } catch {
      this.asking.set(key, { status: 'failed' });
    }
  }

  /** The note written from this sheet, drawn for the panel, if there is one yet. */
  private noteOf(sheet: MachineFactSheet): PanelNote | undefined {
    const known = this.drawn.get(sheet.key);
    if (known) return known;
    const reply = this.store.get(sheet.key);
    if (!reply) return undefined;
    const words = noteVocabulary(sheet.partNames.rows, sheet.partNames.joints);
    const note = panelNote(reply, words, sheet.gate, sheet.family);
    this.drawn.set(sheet.key, note);
    return note;
  }
}

function replyIn(body: unknown): WhatIsThisReply | undefined {
  const reply = (body as { reply?: WhatIsThisReply } | null)?.reply;
  return typeof reply?.plainEnglish === 'string' && reply.plainEnglish.trim() ? reply : undefined;
}
