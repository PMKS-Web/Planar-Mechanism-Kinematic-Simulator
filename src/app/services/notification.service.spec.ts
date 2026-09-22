import { TestBed } from '@angular/core/testing';
import { NotificationService } from './notification.service';

// A reader with three warnings on screen is exactly the reader whose next
// action needs an answer -- and that answer was the one the eviction threw
// away, because it was the only message in the stack with a duration.
describe('making room in a full notification stack', () => {
  let notify: NotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    notify = TestBed.inject(NotificationService);
    notify.dismissAll();
  });

  it('keeps the message the reader just earned', () => {
    notify.warning('w1', 'One');
    notify.warning('w2', 'Two');
    notify.warning('w3', 'Three');
    notify.success('share.copied', 'Link copied.');
    expect(notify.live.map((one) => one.id)).toEqual(['w2', 'w3', 'share.copied']);
  });

  it('still drops a message that was leaving by itself first', () => {
    notify.success('s1', 'First');
    notify.warning('w1', 'One');
    notify.warning('w2', 'Two');
    notify.refusal('r1', 'No.');
    expect(notify.live.map((one) => one.id)).toEqual(['w1', 'w2', 'r1']);
  });
});

describe('notification reading time', () => {
  let notify: NotificationService;
  beforeEach(() => {
    vi.useFakeTimers();
    notify = new NotificationService();
  });
  afterEach(() => {
    notify.dismissAll();
    vi.useRealTimers();
  });

  it('keeps a long message beyond the short-message minimum', () => {
    notify.news('short', 'Done.');
    notify.news('long', Array(40).fill('word').join(' '));
    vi.advanceTimersByTime(4000);
    expect(notify.live.map((one) => one.id)).toEqual(['long']);
    vi.advanceTimersByTime(7500);
    expect(notify.live).toEqual([]);
  });

  it('honors caller duration and persistence', () => {
    notify.warning('timed', 'Temporary warning', { durationMs: 500 });
    notify.success('persistent', 'Keep this', { durationMs: null });
    vi.advanceTimersByTime(500);
    expect(notify.live.map((one) => one.id)).toEqual(['persistent']);
    vi.advanceTimersByTime(60000);
    expect(notify.live).toHaveLength(1);
  });
});
