import { BodyAdmissionRefusal } from './body-admission';
import { SimulationSnapshot } from './simulation-snapshot';

/** The transport and future analysis setup quote the admission result, rather than guessing from joint count. */
export function nativeMotionRefusal(
  snapshot: SimulationSnapshot | undefined
): { short: string; long: string } | undefined {
  if (!snapshot)
    return {
      short: 'drawing is updating',
      long: 'Wait for the drawing to update before playing it.',
    };
  if ([...snapshot.partitions.values()].some((part) => part.ok)) return;
  const first = [...snapshot.partitions.values()].find((part) => !part.ok);
  if (!first || first.ok)
    return { short: 'nothing to play', long: 'Draw a mechanism and add an input to animate it.' };
  const reasons: Record<BodyAdmissionRefusal | 'branch' | 'unsolved', [string, string]> = {
    invalid: [
      'invalid drawing',
      'Check the connections and travel bounds before playing this mechanism.',
    ],
    inconsistent: [
      'conflicting connections',
      'Move the connected points into a consistent starting pose.',
    ],
    'no-drive': ['needs an input', 'Select a joint and add an input to animate this mechanism.'],
    'multiple-drives': [
      'too many inputs',
      'Keep one input for each independently moving mechanism.',
    ],
    immobile: [
      'no freedom to move',
      'Remove a connection or weld to give this mechanism freedom to move.',
    ],
    underconstrained: [
      'needs another connection',
      'Add connections so the input controls every moving link.',
    ],
    'singular-start': [
      'singular starting pose',
      'Move the mechanism slightly away from this starting pose.',
    ],
    'drive-does-not-control-motion': [
      'input cannot control motion',
      'Choose an input that controls the moving links.',
    ],
    travel: ['past a travel stop', 'Move the cylinder or slider inside its travel bounds.'],
    'fixed-drive': [
      'input is fixed',
      'Remove the weld holding this input still, or choose another input.',
    ],
    branch: ['cannot follow this branch', 'Move the starting pose away from this branch change.'],
    unsolved: [
      'cycle could not be completed',
      'Check the connections and starting pose before playing this mechanism.',
    ],
  };
  const [short, long] = reasons[first.reason];
  return { short, long };
}
