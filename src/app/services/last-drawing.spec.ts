import { recallDrawing, rememberDrawing } from './last-drawing';

describe('reload recovery belongs to one browser tab', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.removeItem('lastDrawing');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.removeItem('lastDrawing');
  });

  it('keeps this project when another tab writes the old shared recovery slot', () => {
    rememberDrawing('two-four-bars');
    localStorage.setItem('lastDrawing', 'a-cylinder-from-another-tab');
    expect(recallDrawing()).toBe('two-four-bars');
    rememberDrawing('two-four-bars-after-undo');
    expect(recallDrawing()).toBe('two-four-bars-after-undo');
  });

  it('keeps the latest drawing available on a later browser visit', () => {
    rememberDrawing('saved-for-next-visit');
    sessionStorage.clear();
    expect(recallDrawing()).toBe('saved-for-next-visit');
    rememberDrawing(undefined);
    expect(recallDrawing()).toBe('saved-for-next-visit');
  });

  it('does not fail an edit when session storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => rememberDrawing('drawing')).not.toThrow();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(recallDrawing()).toBeNull();
  });
});
