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
    // Which sentence depends on whether the transport agrees it is displaced.
    const parked = at({ atStart: false, sharedStepZero: false });
    expect(refusalFor('placement', parked)!.short).toBe('shown at pose');
    expect(refusalFor('drive', parked)!.short).toBe('shown at pose');
  });

  it('names the mechanism that is away when the shared clock does not show it', () => {
    // Unsynced, a row can be scrubbed a third of the way round while the shared
    // handle still reads zero. "Not at the start" over a scrubber reading 0:00
    // sends a reader to a control that looks parked, so the machine that is
    // actually away is named instead -- named, not counted: the app knows what
    // it is called.
    const hidden = at({ atStart: false, sharedStepZero: true, awayMachine: 'M2' });
    expect(refusalFor('placement', hidden)!.long).toContain('M2 is parked away from its start');
    expect(displacementRefusal(hidden)!.long).toContain('M2 is parked away from its start');
    // And falls back to a sentence that names nothing, rather than to "M2" for
    // a machine nobody has named.
    const unnamed = at({ atStart: false, sharedStepZero: true });
    expect(refusalFor('placement', unnamed)!.long).toContain('One of the mechanisms');
  });

  it('writes every refusal as one sentence and as pieces that rebuild it', () => {
    // `long` is built from the pieces rather than written twice: the two used to
    // be separate strings, which is how a surface comes to quote a sentence the
    // panel no longer says.
    const states: EditState[] = [
      at({ mode: 'synthesis' }),
      at({ mode: 'analysis' }),
      at({ playing: true, atStart: false }),
      at({ atStart: false, sharedStepZero: false }),
      at({ atStart: false, solveDeferred: true }),
      at({ empty: true, runnable: false }),
    ];
    states.forEach((state) => {
      EDIT_ACTIONS.forEach((action) => {
        const why = refusalFor(action, state);
        if (!why) return;
        expect(why.glyph.length).toBeGreaterThan(0);
        expect(why.long).toContain(why.lead);
        if (why.action) expect(why.long).toContain(why.action);
      });
    });
  });

  it('lets an analysis mode tune what exists, and not restructure it', () => {
    // The whole of the analysis unlock, as a row of the matrix. The line is
    // drawn at what the graphs are graphs *of*: dragging a joint changes a
    // dimension and the curves follow, which is the point; adding or deleting
    // one changes what the mechanism is, which belongs in Edit.
    const analysing = at({ mode: 'analysis' });
    expect(allowed(analysing)).toEqual(['inspect', 'drag', 'transport', 'history']);
    expect(refusalFor('build', analysing)!.short).toBe('lives in Edit');
    expect(refusalFor('structure', analysing)!.short).toBe('lives in Edit');
    expect(refusalFor('placement', analysing)!.short).toBe('lives in Edit');
  });

  it('never lets an analysis mode allow more than Edit would', () => {
    // One gradient of freedom across the modes rather than two regimes to
    // learn: analysis unlocks a subset of Edit, never a superset. Checked over
    // the pose states as well, because the analysis column asks the same
    // questions about pose once the mode has had its say.
    const poses: Partial<EditState>[] = [
      {},
      { playing: true, atStart: false },
      { atStart: false, sharedStepZero: false },
      { atStart: false, solveDeferred: true },
    ];
    poses.forEach((pose) => {
      const inEdit = new Set(allowed(at({ ...pose, mode: 'edit' })));
      allowed(at({ ...pose, mode: 'analysis' })).forEach((action) => {
        expect(inEdit.has(action)).toBe(true);
      });
    });
  });

  it('asks an analysis mode the same questions about pose that Edit asks', () => {
    // A drag there stages and re-anchors exactly as it does in Edit, so it is
    // refused while the mechanism is running for the same reason and in the
    // same words.
    expect(allowed(at({ mode: 'analysis', playing: true, atStart: false }))).toEqual([
      'inspect',
      'transport',
    ]);
    expect(refusalFor('drag', at({ mode: 'analysis', playing: true, atStart: false }))!.short).toBe(
      'animation running'
    );
    // And allowed at a paused pose, which is where the tuning happens.
    expect(refusalFor('drag', at({ mode: 'analysis', atStart: false }))).toBeNull();
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

  it('names the mechanism when the shared clock disagrees', () => {
    // Unsynced, a row can be parked mid-cycle while the transport reads 0:00.
    // "Not at the start" over a scrubber that looks parked sends the reader to
    // the wrong control, so that case gets its own words.
    const shared = displacementRefusal(at({ atStart: false, sharedStepZero: false }));
    const unsynced = displacementRefusal(at({ atStart: false, sharedStepZero: true }));
    expect(shared!.short).toBe('not at the start');
    expect(unsynced!.short).toBe('a mechanism is mid-cycle');
    // Both are cleared by the same button, and both say so.
    expect(shared!.backToStartHelps).toBe(true);
    expect(unsynced!.backToStartHelps).toBe(true);
  });

  it('lets undo into the analysis modes, which used to be refused there', () => {
    // Undo was refused here because replaying a URL swaps the geometry the
    // graphs are drawn from. The graphs redraw from whatever was last solved,
    // so that stopped being a reason -- and unlocking drags without undo would
    // strand a bad drag behind a mode switch.
    expect(refusalFor('history', at({ mode: 'analysis' }))).toBeNull();
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
