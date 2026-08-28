import { RevJoint } from './joint';
import { RealLink } from './link';
import {
  aggregateCommonValue,
  isAdditiveSelectionGesture,
  partRef,
  resolveSelectedParts,
  samePartRef,
} from './selection';

describe('typed part selection', () => {
  it('keeps a joint and link with the same id distinct', () => {
    const joint = new RevJoint('A', 0, 0);
    const other = new RevJoint('B', 1, 0);
    const link = new RealLink('A', [joint, other]);

    expect(partRef(joint)).toEqual({ kind: 'joint', id: 'A' });
    expect(partRef(link)).toEqual({ kind: 'link', id: 'A' });
    expect(samePartRef(partRef(joint), partRef(link))).toBe(false);
  });

  it('resolves compound leaves as selectable links', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 2, 0);
    const ab = new RealLink('AB', [a, b]);
    const bc = new RealLink('BC', [b, c]);
    const compound = new RealLink('ABC', [a, b, c], 0, 0, undefined, [ab, bc]);

    expect(resolveSelectedParts([{ kind: 'link', id: 'BC' }], [a, b, c], [compound])).toEqual([bc]);
  });
});

describe('additive selection modifier', () => {
  it('uses Command on macOS and leaves Control-click to the context menu', () => {
    expect(isAdditiveSelectionGesture({ ctrlKey: true, metaKey: false }, 'MacIntel')).toBe(false);
    expect(isAdditiveSelectionGesture({ ctrlKey: false, metaKey: true }, 'MacIntel')).toBe(true);
  });

  it('uses Control on Windows and Linux', () => {
    expect(isAdditiveSelectionGesture({ ctrlKey: true, metaKey: false }, 'Win32')).toBe(true);
    expect(isAdditiveSelectionGesture({ ctrlKey: true, metaKey: false }, 'Linux x86_64')).toBe(
      true
    );
  });
});

describe('common-value aggregation', () => {
  it('reports a common value when every selected item agrees', () => {
    expect(aggregateCommonValue([4, 4, 4])).toEqual({ kind: 'common', value: 4 });
  });

  it('reports Mixed when selected values differ', () => {
    expect(aggregateCommonValue([4, 5])).toEqual({ kind: 'mixed' });
  });

  it('accepts a caller-supplied equality rule for numeric display tolerances', () => {
    const aggregate = aggregateCommonValue(
      [1, 1 + 1e-10],
      (left, right) => Math.abs(left - right) < 1e-8
    );

    expect(aggregate).toEqual({ kind: 'common', value: 1 });
  });

  it('distinguishes no applicable values from a mixed value', () => {
    expect(aggregateCommonValue([])).toEqual({ kind: 'empty' });
  });
});
