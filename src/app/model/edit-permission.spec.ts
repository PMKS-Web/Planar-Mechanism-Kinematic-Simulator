import {
  EDIT_ACTIONS,
  EditAction,
  EditState,
  displacementRefusal,
  refusalFor,
} from './edit-permission';

/** A drawing that can run, parked at its start, in Edit. Everything is allowed. */
const READY: EditState = {
  mode: 'edit',
  playing: false,
  atStart: true,
  sharedStepZero: true,
  solveDeferred: false,
  empty: false,
  runnable: true,
};

const at = (over: Partial<EditState>): EditState => ({ ...READY, ...over });

/** Which of the whole action set is allowed in this state. */
const allowed = (state: EditState): EditAction[] =>
  EDIT_ACTIONS.filter((action) => refusalFor(action, state) === null);

describe('what is allowed when', () => {
  it('allows everything at the start pose in Edit', () => {
    expect(allowed(READY)).toEqual([...EDIT_ACTIONS]);
  });

  it('refuses every edit while playing, and keeps the transport', () => {
    // Playing is read-only, and it is also the one state where the transport
    // must stay live: it is the control that ends it.
    expect(allowed(at({ playing: true, atStart: false }))).toEqual(['inspect', 'transport']);
  });

  it('lets a gesture edit at a paused pose, and still refuses typed numbers', () => {
    // The whole of Phase 2, as a row of the matrix. A drag at a pose means
    // "put it here, at this pose" and the app can honor that -- the edit lands
    // and the machine is put back on its anchor underneath. A typed X is a
    // pose coordinate, and the transform back to t = 0 for it is not written.
    expect(allowed(at({ playing: false, atStart: false }))).toEqual([
      'inspect',
      'drag',
      'build',
      'structure',
      'transport',
      'history',
    ]);
    expect(refusalFor('placement', at({ atStart: false }))!.short).toBe('shown at pose');
    expect(refusalFor('drive', at({ atStart: false }))!.short).toBe('shown at pose');
  });

  it('keeps a deferred drawing read-only away from its start', () => {
    // No cycle to anchor against, and re-anchoring costs a solve per commit --
    // which is the exact cost the deferral exists to refuse. At the start these
    // edit exactly as they always did.
    const heavy = at({ atStart: false, solveDeferred: true });
    expect(allowed(heavy)).toEqual(['inspect', 'transport']);
    expect(refusalFor('drag', heavy)!.long).toContain('Press Play');
    expect(allowed(at({ solveDeferred: true }))).toEqual([...EDIT_ACTIONS]);
  });

  it('names the machine when the shared clock disagrees', () => {
    // Unsynced, a row can be parked mid-cycle while the transport reads 0:00.
    // "Not at the start" over a scrubber that looks parked sends the reader to
    // the wrong control, so that case gets its own words.
    const shared = displacementRefusal(at({ atStart: false, sharedStepZero: false }));
    const unsynced = displacementRefusal(at({ atStart: false, sharedStepZero: true }));
    expect(shared!.short).toBe('not at the start');
    expect(unsynced!.short).toBe('a machine is mid-cycle');
    // Both are cleared by the same button, and both say so.
    expect(shared!.backToStartHelps).toBe(true);
    expect(unsynced!.backToStartHelps).toBe(true);
  });

  it('refuses editing in the analysis modes whatever the pose', () => {
    expect(allowed(at({ mode: 'analysis' }))).toEqual(['inspect', 'transport']);
    // Including undo, which replays a URL and would swap the geometry the
    // graphs are drawn from.
    expect(refusalFor('history', at({ mode: 'analysis' }))!.short).toBe('analysis mode');
  });

  it('has no transport at all in Synthesis', () => {
    expect(refusalFor('transport', at({ mode: 'synthesis' }))!.short).toBe('synthesis mode');
    expect(allowed(at({ mode: 'synthesis' }))).toEqual(['inspect']);
  });

  it('says what is missing rather than nothing, over a drawing that cannot run', () => {
    expect(refusalFor('transport', at({ empty: true, runnable: false }))!.long).toBe(
      'Nothing to play yet \u2014 draw a mechanism.'
    );
    // Something is drawn, but it belongs to no machine -- which readiness, being
    // per machine, has nothing to say about.
    const orphaned = refusalFor('transport', at({ empty: false, runnable: false }));
    expect(orphaned!.long).toContain('Ground a joint');
    // And an empty grid still edits: there is nothing wrong with drawing on it.
    expect(refusalFor('build', at({ empty: true, runnable: false }))).toBeNull();
  });

  it('leaves Play alone on a drawing whose solve was deferred', () => {
    // Pressing it is the request that works the motion out. A greyed button
    // there would say the drawing cannot run, which is not true.
    expect(refusalFor('transport', at({ solveDeferred: true, runnable: false }))).toBeNull();
  });

  it('never refuses looking at anything, anywhere', () => {
    const everywhere: EditState[] = [
      at({ mode: 'analysis' }),
      at({ mode: 'synthesis' }),
      at({ playing: true, atStart: false }),
      at({ empty: true, runnable: false }),
    ];
    everywhere.forEach((state) => expect(refusalFor('inspect', state)).toBeNull());
  });

  it('gives every refusal both lengths, so no surface has to invent one', () => {
    const states = [
      at({ mode: 'analysis' }),
      at({ mode: 'synthesis' }),
      at({ playing: true, atStart: false }),
      at({ atStart: false, sharedStepZero: false }),
      at({ atStart: false, sharedStepZero: true }),
      at({ empty: true, runnable: false }),
      at({ empty: false, runnable: false }),
    ];
    states.forEach((state) =>
      EDIT_ACTIONS.forEach((action) => {
        const refusal = refusalFor(action, state);
        if (!refusal) return;
        expect(refusal.short.length).toBeGreaterThan(0);
        // A sentence, not a phrase: these land in banners and tooltips.
        expect(refusal.long.trim().endsWith('.')).toBe(true);
      })
    );
  });
});
