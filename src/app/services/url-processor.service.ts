import { Injectable, Injector, inject } from '@angular/core';
import { MechanismService } from './mechanism.service';
import { recallDrawing } from './last-drawing';
import { StringTranscoder } from './transcoding/string-transcoder';
import { SettingsService } from './settings.service';
import { MechanismBuilder } from './transcoding/mechanism-builder';
import { SvgGridService } from './svg-grid.service';
import { ActiveObjService } from './active-obj.service';
import { NotificationService } from './notification.service';
import { SelectedTabService, TabID } from '../selected-tab.service';
import { SynthesisBuilderService } from './synthesis/synthesis-builder.service';
import { applySynthesisDesign } from './synthesis/synthesis-url';
import { SynthesisSolutionService } from './synthesis/synthesis-solution.service';

/** The one query that names a screen instead of describing a mechanism. */
const LIBRARY_QUERY = 'library';

/**
 * Whether this load is the same visit again rather than a new one.
 *
 * A refresh and a Back both come back to a page the reader had already been
 * working on; a typed address, a followed link and a new tab do not. The
 * Navigation Timing entry is what the browser knows about which happened, and
 * a browser that has no opinion is treated as a fresh arrival -- the safe way
 * round, since restoring a drawing nobody asked for is worse than not.
 */
function returningToThePage(): boolean {
  try {
    const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    return entry?.type === 'reload' || entry?.type === 'back_forward';
  } catch {
    return false;
  }
}

/**
 * Whether this address is somebody else's query rather than a mechanism.
 *
 * The codec's alphabet is letters, digits, `_` and `-`, with `.` and `,` for
 * its separators; it never writes an `=`. So a query whose every piece is a
 * `key=value` pair is a link that was decorated on its way here -- a campaign
 * tag, a click id -- and the right answer is the empty grid `/` already gives,
 * not an error about a mechanism nobody sent.
 */
function looksLikeQueryParameters(url: string): boolean {
  const pieces = url.split('&').filter((piece) => piece.length > 0);
  return pieces.length > 0 && pieces.every((piece) => /^[^=]+=[^=]*$/.test(piece));
}
/** What a new tab's fragment says before the template's name. */
const BACKDROP_QUERY = 'backdrop=';

@Injectable({
  providedIn: 'root',
})
export class UrlProcessorService {
  private injector = inject(Injector);
  private settingsSrv = inject(SettingsService);
  private svgGrid = inject(SvgGridService);
  private activeObj = inject(ActiveObjService);
  private notify = inject(NotificationService);
  private synthesis = inject(SynthesisBuilderService);

  /**
   * Whether the address asked for the mechanism library rather than carrying a
   * mechanism. Read once, by whoever is in a position to open a dialog.
   *
   * `?library` is a deep link for the landing page's "Browse the mechanism
   * library" button, which until now could only drop somebody onto an empty
   * grid and leave them to find the project menu. It is safe to tell apart from
   * a real payload because an encoded mechanism always begins with a version
   * digit and the word does not, and because every payload this app has ever
   * written ends in a checksum that "library" does not satisfy -- so the worst
   * case for a collision is the failure that already exists.
   */
  readonly wantsLibrary: boolean;

  /**
   * The template whose picture the address asked for, by name.
   *
   * Read here rather than off `window.location` later, because the decode strips
   * the address in its own `finally` -- and that runs in this constructor, long
   * before any component is alive to look. `wantsLibrary` is read here for the
   * same reason.
   */
  readonly wantsBackdropFor: string | null;

  constructor() {
    // the content part of the url (the part after the ?)
    let fromAddress: string | null = null;
    let invalidAddress = false;
    this.wantsBackdropFor = null;
    try {
      fromAddress = this.getURLContent();
      this.wantsBackdropFor = this.backdropAsked();
    } catch (error) {
      // Percent escapes are parsed before the mechanism codec. A malformed
      // query or fragment must not abort service construction and strand the
      // reader behind the startup cover, or restore a different saved drawing.
      invalidAddress = true;
      fromAddress = null;
      this.reportInvalidURL(error);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    this.wantsLibrary = fromAddress !== null && fromAddress.trim().toLowerCase() === LIBRARY_QUERY;
    // Nothing in the address, and the reader did not mean to arrive: they
    // refreshed, or pressed Back. A refresh used to take everything -- the
    // document lives in memory, the address bar is stripped once a shared link
    // has been decoded, and there was no prompt on the way out and nothing to
    // come back to. The last state the history recorded is a complete URL, so
    // bringing it back is the whole of a recovery.
    //
    // Only on those two navigations. Opening a new project, following a link,
    // or typing the address is somebody asking for a fresh grid, and handing
    // them the last drawing instead would be answering a question they did not
    // ask.
    //
    // One slot, not a second history: a visit in between -- the library, a
    // template -- records itself over it, so Back reaches whatever was last
    // stood on rather than walking backwards through the session. Refreshing
    // the work you are in the middle of is the case this exists for.
    const url = fromAddress ?? (!invalidAddress && returningToThePage() ? recallDrawing() : null);

    // update the mechanism from the url
    //
    // Nothing to decode when the address is asking for a screen, and handing
    // the word to the decoder would raise "that shared link could not be
    // opened" over the library the reader just asked for.
    this.updateFromURL(this.wantsLibrary ? null : url, true, true, true);
    // The strip that a decode does in its `finally`, for the branch that skips
    // it: a reload should not be a second trip through the front door, and the
    // address bar should say what is on screen.
    if (this.wantsLibrary) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  /**
   * Which template's backdrop the fragment names, if it names one.
   *
   * A template opened in a new tab carries its card's name after the '#': the
   * query is the mechanism, checksum and all, and a second parameter beside it
   * would not decode. Only the name travels -- the picture is an asset the app
   * already ships.
   */
  private backdropAsked(): string | null {
    const hash = decodeURI(window.location.hash);
    const at = hash.indexOf(BACKDROP_QUERY);
    return at === -1 ? null : hash.slice(at + BACKDROP_QUERY.length) || null;
  }

  /**
   * The content part of the address: what follows the '?' and stops at a '#'.
   *
   * The fragment is not part of the query and never was, but this took
   * everything to the end of the string -- so a shared link with any anchor on
   * the end handed the decoder a payload with `#whatever` glued to it, failed
   * the checksum, and opened an empty grid saying the link could not be read.
   * Nothing in the codec's alphabet is a '#' (see `BaseNConverter.baseNChars`),
   * so the first one is always where the mechanism ends.
   */
  private getURLContent(): string | null {
    const fullURL = decodeURI(window.location.href);
    const index = fullURL.indexOf('?');
    if (index === -1) return null;
    const content = fullURL.substring(index + 1);
    const fragment = content.indexOf('#');
    const query = fragment === -1 ? content : content.substring(0, fragment);
    // A bare '?' carries nothing, and nothing is what `/` means: it opened an
    // empty grid under "that shared link could not be opened".
    return query.length > 0 ? query : null;
  }

  private reportInvalidURL(error: unknown): void {
    console.error('Unable to load mechanism URL', error);
    // Construction precedes the notification overlay, so wait for it to exist.
    setTimeout(() => {
      this.notify.failure(
        'url.undecodable',
        'That shared link could not be opened — it may be from an older version of PMKS+.'
      );
    });
  }

  // Decode the url and update mechanism
  updateFromURL(
    url: string | null,
    resetSvgScale: boolean = true,
    updateSettings: boolean = true,
    save: boolean = false,
    /**
     * True when this is a step within one mechanism's own history rather than a
     * different mechanism arriving. Undo and redo pass it; opening a project,
     * loading a template and the initial URL decode do not.
     */
    continuingHistory: boolean = false
  ) {
    const mechanismSrv = this.injector.get(MechanismService);
    // A different mechanism reuses the same joint letters and means something
    // different by them, so nothing remembered per joint may carry across --
    // nor does whether somebody chose a mark size, which was a fact about the
    // drawing being replaced. It is the incoming URL that says what size this
    // one's marks are, and that number is the only evidence there is about
    // whether its author picked it (svg-grid.service, adoptScaleForDrawing).
    if (!continuingHistory) {
      mechanismSrv.forgetSessionPreferences();
      SettingsService.objectScaleChosen = false;
    }

    // Rewind before the incoming mechanism takes the joints array over.
    //
    // `updateMechanism` puts the editable joints back on sample 0 before it
    // rebuilds, because they are simultaneously what the grid draws and what
    // the rebuild reads as t = 0. That works everywhere except here: by the
    // time it runs, the joints it is putting back belong to the mechanism that
    // has just arrived while the solved samples it reads them from still belong
    // to the one being replaced. Paired off by index, a template opened over a
    // running animation came up wearing the old linkage's start pose — and,
    // where the new linkage had more joints than the old, indexed past the end
    // of the samples and got NaN. Rewinding here, while frames and joints still
    // belong to each other, leaves that call with nothing left to do.
    // What is selected right now, so a step through history can put it back.
    //
    // Selection rides along in the same URL the history is made of, so undo
    // restored whatever happened to be selected when the *earlier* state was
    // written — and the panel silently re-pointed at another object. Undoing an
    // edit to joint B left you reading joint N's panel, which looks for all the
    // world like B's own switches turning themselves off.
    //
    // Selecting something is not an edit. It earns no history entry, so it
    // should not be undone by one.
    //
    // Parts are an ordered typed snapshot, not object references: joint and
    // link ids may collide, and decoding replaces every selected object.
    // Forces remain singular, while scenery and screen selections have no
    // mechanism identity worth carrying through history.
    const heldPartSelection = continuingHistory
      ? this.activeObj.snapshotPartSelection()
      : undefined;
    const heldForceSelection =
      continuingHistory && this.activeObj.objType === 'Force'
        ? this.activeObj.selectedForce?.id
        : undefined;
    mechanismSrv.rewindToStart();
    // The unit the drawing is about to be expressed in decides how big it is on
    // screen, and the viewport is compensated for that -- but only where the
    // change came from the settings panel. Replaying a step that crossed a unit
    // change has to compensate too, or the geometry comes back at its old size
    // through a viewport still zoomed for the new one.
    const unitBefore = this.settingsSrv.lengthUnit.value;

    // the transcoder is responsible for decoding the url into a mechanism
    const decoder = new StringTranscoder();

    // if the url exists, decode it and build the mechanism. Otherwise, skip to updating mechanism directly
    if (url !== null) {
      try {
        console.log('decoded url: ' + url);
        decoder.decodeURL(url);
        const builder = new MechanismBuilder(
          mechanismSrv,
          decoder,
          this.settingsSrv,
          this.activeObj
        );
        // Never the playhead. A history step used to note the sample the
        // reader was watching and seek the rebuilt drawing to it again; that
        // seek is gone (below), so restoring the *step* alone put the shared
        // clock at sample 120 over a drawing standing at its start -- the
        // transport read a third of a turn, the pose said zero, and the
        // permission model believed the transport. Pose is not part of
        // history (plan §6.4); neither is the number that names one.
        builder.build(updateSettings, false);
        // After the mechanism, because a design is about a machine that is not
        // on the grid yet and so has nothing in the build to wait for -- but
        // before the rebuild below, so the panel and the canvas come up
        // describing the same state.
        applySynthesisDesign(decoder.getSynthesisMarks(), this.synthesis);
        // Ownership names joints this URL is supposed to carry. Anything it
        // names that is not here was removed by hand at some point, and a
        // claim on an object that does not exist is not a claim worth keeping.
        const present = new Set(mechanismSrv.joints.map((joint) => joint.id));
        // Ids and their baselines are one list in two arrays, so they are
        // filtered together or not at all -- dropping an id on its own would
        // slide every baseline after it onto the wrong joint.
        const survives = this.synthesis.ownedJointIds.map((id) => present.has(id));
        const kept = this.synthesis.ownedJointIds.filter((_, index) => survives[index]);
        const keptAt = this.synthesis.ownedAt.filter((_, index) => survives[index]);
        // Dropping the ids of joints that are gone is right -- a claim on
        // something that does not exist would be inherited by whatever new
        // joint next took that letter. But dropping them silently threw away
        // the one fact that made the linkage entangled rather than ours, so a
        // reload turned "you cut into this, I will leave it alone" into "this
        // is mine, I will delete it": the reader's own edits, removed without
        // the warning that exists to prevent exactly that.
        // Only while something of ours is still standing. If every joint we
        // wrote has been taken away there is nothing left to be entangled
        // with -- the design owns nothing, and saying otherwise would keep a
        // section in every URL it writes from then on.
        if (kept.length > 0 && kept.length !== this.synthesis.ownedJointIds.length) {
          this.synthesis.ownershipPartial = true;
        } else if (kept.length === 0) {
          this.synthesis.ownershipPartial = false;
        }
        this.synthesis.ownedJointIds = kept;
        this.synthesis.ownedAt = keptAt;
        // A decode replaces the design wholesale, so whatever was found for the
        // last one says nothing about this one. Resolved late, like the other
        // services this one reaches: asking for it at construction would build
        // MechanismService before this service is finished being built.
        this.injector.get(SynthesisSolutionService).invalidate();
      } catch (error) {
        // A query that was never a mechanism is not a broken one. A link
        // decorated by a mailer or a social share arrives as
        // `?utm_source=twitter`, and saying "that shared link could not be
        // opened" over an empty grid tells a reader their mechanism was lost
        // when there never was one. Ordinary query parameters are the one
        // shape worth telling apart: the encoder writes no '=' at the top
        // level, so every '&'-separated piece carrying one is somebody else's
        // tracking, not our payload.
        if (looksLikeQueryParameters(url)) {
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }
        // Deferred because this can run inside the service's own constructor,
        // before there is an overlay to open into. A failure, and it waits to
        // be dismissed: the reader followed a link that did not work, and the
        // grid they are looking at instead is not an obvious clue that it
        // didn't.
        this.reportInvalidURL(error);
      } finally {
        // Invalid data must not remain in the address bar or be retried on refresh.
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    // Put the selection back before the mechanism is rebuilt, so everything
    // downstream — the panel, the canvas highlight, the analysis graphs — is
    // built once, against the object the user is actually looking at.
    //
    // By id rather than by reference: the decode replaces every joint and link
    // with a new object, so the one held above no longer exists. If its id does
    // not either, the edit really did remove it and nothing selected is the
    // honest answer -- which is what the build has just left behind.
    //
    // By id *and* kind: ids are letters handed out alphabetically, so the same
    // letter can name a joint in one state and a link in the next, and a
    // lookup that took the first match would change what the panel is about.
    if (heldPartSelection?.refs.length) {
      this.activeObj.restorePartSelection(
        heldPartSelection,
        mechanismSrv.joints,
        mechanismSrv.links,
        mechanismSrv.forces
      );
    } else if (heldForceSelection) {
      const restored = mechanismSrv.forces.find((force) => force.id === heldForceSelection);
      if (restored) this.activeObj.updateSelectedObj(restored);
    }

    // Through the structural seam rather than straight to `updateMechanism`.
    //
    // Decoding a URL builds a whole mechanism, which is as structural as an
    // edit gets — but it was the one path that skipped the reconcilers, so a
    // mechanism could arrive carrying a state the app itself would not build
    // and nothing looked at it. A URL is a compatibility surface: whatever an
    // older version wrote has to keep opening, and has to open as something
    // coherent.
    // Before the rebuild, not after it. Every anchor is dropped and re-read
    // from the drawing that has just arrived -- a history step or a URL load is
    // authoritative, and no anchor outlives one. Dropping them *after*
    // `finishStructuralEdit` threw away the ones it had just taken, and every
    // freshly opened mechanism had no anchor at all until its first edit.
    mechanismSrv.forgetAnchors();
    mechanismSrv.finishStructuralEdit(save);

    // Undo rewinds. A saved URL stores the drawing at its start pose, so this
    // used to note which sample was showing, rebuild, and jump forward to that
    // sample again -- a loaded gun that the old rules kept unloaded, because
    // undo was only legal while parked at the start and the noted index was
    // always zero.
    //
    // Now that an edit at a displaced pose is legal, so is the undo of one, and
    // the jump is wrong twice over: "sample 40" belonged to the *edited*
    // drawing's cycle, and the restored drawing is older geometry with a
    // different cycle that may not even have forty samples; and the jump moves
    // only the shared clock, leaving unsynced machines where they were.
    //
    // Pose is not part of history; edits are. The jump is simply gone: the
    // restored drawing arrives at its own start, because `rewindToStart` above
    // parked the outgoing one before it was replaced and nothing moves it
    // afterwards.
    //
    // There is no ease to run either, and the call that was written here was
    // one: easing implies a pose to travel from, and the geometry that pose
    // belonged to no longer exists by this point -- so it could only ever find
    // the drawing already at zero and return, while reading like a promise
    // that it did not keep.
    //
    // Anchors are dropped just above, before the rebuild rather than after it:
    // a history or URL load is authoritative, and no anchor outlives one.

    // A drawing that arrives while an analysis mode is open, and that nothing
    // in can be analyzed, leaves the reader in a mode with no graphs, no
    // transport and no way to fix any of it -- the geometry is locked. Edit is
    // where the work is. Only for a drawing that *arrives*: a step through this
    // mechanism's own history is not a new subject.
    if (!continuingHistory) {
      const tabs = this.injector.get(SelectedTabService);
      const tab = tabs.getCurrentTab();
      // The mode's own gate, not kinematics twice: force analysis asks for more
      // than a mechanism that runs -- something loading it -- and a drawing
      // that solves kinematically but has nothing to push it leaves Force
      // Analysis on screen with no numbers in it and the geometry locked. The
      // same rule TopBarComponent.canAnalyse applies when the mode is pressed.
      const ready =
        tab === TabID.FORCE
          ? mechanismSrv.forceAnalysisReady()
          : mechanismSrv.oneValidMechanismExists();
      if (tabs.isAnalysisMode(tab) && !ready) {
        tabs.setTab(TabID.EDIT);
      }
    }

    if (resetSvgScale) {
      // Frame it as soon as it has been drawn, and without the glide: a
      // mechanism that arrives should already be in view, not zoom itself in
      // once a second has passed. `scaleToFitLinkage` waits for the render.
      this.svgGrid.scaleToFitLinkage(false);
    } else {
      this.svgGrid.compensateForUnitChange(unitBefore, this.settingsSrv.lengthUnit.value);
    }
  }
}
