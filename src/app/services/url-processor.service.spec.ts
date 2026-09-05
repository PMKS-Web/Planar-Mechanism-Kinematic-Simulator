import { TestBed } from '@angular/core/testing';
import { MechanismService } from './mechanism.service';
import { UrlProcessorService } from './url-processor.service';
import { TEMPLATE_LINKAGES } from '../component/MODALS/templates/template-linkages';
import { ActiveObjService } from './active-obj.service';
import { RealLink } from '../model/link';
import { RealJoint } from '../model/joint';
import { NotificationService } from './notification.service';

describe('malformed address recovery', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.useRealTimers();
  });

  it.each(['?%', '#%', '?%E0%A4%A', '#backdrop=%E0%A4%A'])(
    'finishes startup and reports an invalid link for %s',
    (address) => {
      vi.useFakeTimers();
      window.history.replaceState({}, '', '/' + address);
      const failure = vi.fn();
      TestBed.configureTestingModule({
        providers: [{ provide: NotificationService, useValue: { failure } }],
      });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const urls = TestBed.inject(UrlProcessorService);

      expect(urls.wantsLibrary).toBe(false);
      expect(urls.wantsBackdropFor).toBeNull();
      expect(window.location.search).toBe('');
      expect(window.location.hash).toBe('');
      expect(TestBed.inject(MechanismService).joints).toHaveLength(0);
      vi.advanceTimersByTime(0);
      expect(failure).toHaveBeenCalledWith('url.undecodable', expect.any(String));
    }
  );

  it('still opens a valid mechanism with a percent-encoded backdrop name', () => {
    window.history.replaceState({}, '', '/?' + TEMPLATE_LINKAGES['4-Bar'] + '#backdrop=Four%20Bar');
    TestBed.configureTestingModule({});
    const urls = TestBed.inject(UrlProcessorService);
    expect(urls.wantsBackdropFor).toBe('Four Bar');
    expect(TestBed.inject(MechanismService).joints.length).toBeGreaterThan(0);
  });
});

/**
 * Opening a linkage over one that is already running.
 *
 * The rebuild that follows a load puts the editable joints back on sample 0
 * first, because those joints are both what the grid draws and what the rebuild
 * reads as t = 0. When the load is a *different* linkage, that pairs the joints
 * that have just arrived against the solved samples of the ones they replaced —
 * matched up by array index, with nothing checking that the two describe the
 * same mechanism. A short linkage opened over a long one came up wearing the
 * old one's pose; a long one opened over a short one ran off the end of the
 * samples and drew at NaN.
 */
describe('opening a linkage while another is animating', () => {
  let mechanism: MechanismService;
  let urls: UrlProcessorService;

  // A four-bar has fewer joints than a Jansen leg, so loading the second over
  // the first is the case with no sample left to pair against — the one that
  // produced NaN rather than merely the wrong picture.
  const SHORT = TEMPLATE_LINKAGES['4-Bar'];
  const LONG = TEMPLATE_LINKAGES['Jansen_Leg'];

  const load = (payload: string) => urls.updateFromURL(payload, false, true, false);
  const pose = () => mechanism.joints.map((joint) => ({ id: joint.id, x: joint.x, y: joint.y }));

  beforeEach(() => {
    TestBed.configureTestingModule({});
    mechanism = TestBed.inject(MechanismService);
    urls = TestBed.inject(UrlProcessorService);
  });

  // A static, so it outlives the TestBed and a spec that leaves it playing
  // fails whatever runs next.
  afterEach(() => {
    mechanism.isPlaying = false;
    mechanism.animate(0, false);
  });

  it('opens the new linkage at its own start pose, not the old one at its', () => {
    load(LONG);
    const rested = pose();
    expect(rested.length).toBeGreaterThan(0);

    load(SHORT);
    // Well away from the start pose, and playing: only paused-at-zero counts as
    // resting, because playback draws blended past its own sample.
    mechanism.animate(40, true);
    expect(mechanism.joints.some((joint) => joint.x !== 0)).toBe(true);

    load(LONG);
    expect(pose()).toEqual(rested);
  });

  it('never leaves a joint at NaN when the new linkage is the longer one', () => {
    load(SHORT);
    mechanism.animate(40, true);
    load(LONG);

    for (const joint of mechanism.joints) {
      expect(Number.isFinite(joint.x), `${joint.id}.x`).toBe(true);
      expect(Number.isFinite(joint.y), `${joint.id}.y`).toBe(true);
    }
  });

  it('stops playback rather than running the new linkage on the old clock', () => {
    load(SHORT);
    mechanism.animate(40, true);
    expect(mechanism.isPlaying).toBe(true);

    load(LONG);
    expect(mechanism.isPlaying).toBe(false);
    expect(mechanism.mechanismTimeStep).toBe(0);
  });
});

describe('transient multi-selection through URL-backed history', () => {
  let mechanism: MechanismService;
  let urls: UrlProcessorService;
  let active: ActiveObjService;
  const FOUR_BAR = TEMPLATE_LINKAGES['4-Bar'];

  beforeEach(() => {
    TestBed.configureTestingModule({});
    mechanism = TestBed.inject(MechanismService);
    urls = TestBed.inject(UrlProcessorService);
    active = TestBed.inject(ActiveObjService);
    urls.updateFromURL(FOUR_BAR, false, true, false);
  });

  it('reconstructs every typed selection identity against newly decoded objects', () => {
    const joint = mechanism.joints.find(
      (candidate): candidate is RealJoint => candidate instanceof RealJoint
    )!;
    const link = mechanism.links.find(
      (candidate): candidate is RealLink => candidate instanceof RealLink
    )!;
    active.togglePartSelection(joint);
    active.togglePartSelection(link);
    const before = active.selectedParts;
    const refs = active.selectedPartRefs;

    urls.updateFromURL(FOUR_BAR, false, true, false, true);

    expect(active.selectedPartRefs).toEqual(refs);
    expect(active.selectedParts).toHaveLength(2);
    expect(active.selectedParts[0]).not.toBe(before[0]);
    expect(active.selectedParts[1]).not.toBe(before[1]);
    expect(active.objType).toBe('MultiSelection');
  });
});
