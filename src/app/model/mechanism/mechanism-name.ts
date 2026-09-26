import { Joint, RealJoint } from '../joint';
import { MechanismPartition } from './mechanism-partition';

/**
 * A mechanism's name, which its author gives it: "Pump jack", "Left leg".
 *
 * A mechanism is not stored. It is worked out from the drawing on every
 * rebuild (`mechanism-partition.ts`), and M1, M2 are only the order the
 * partition happened to find them in. So a name is kept on one of its joints,
 * the way a machine's speed is kept on its driven joint (`Joint.driveSpeed`),
 * and is found again from whichever of its joints carries it: it survives a
 * rebuild, the machine moving up the list, and its input moving to another
 * joint. Two machines joined into one keep the first name found; a machine
 * split in two keeps it on the half that has the joint.
 */

/**
 * A machine's joints in letter order, the ones a reader sees first: a joint
 * nothing shows keeps an interior name with a digit in it (`A1`, a cylinder's
 * buried end), and is derived afresh on every rebuild.
 */
function byLetter(joints: readonly Joint[]): Joint[] {
  const hidden = (joint: Joint) => /\d/.test(joint.id);
  return [...joints].sort(
    (a, b) => Number(hidden(a)) - Number(hidden(b)) || a.id.localeCompare(b.id)
  );
}

/** The joint a machine's name is written to: its driven joint, or else its first by letter. */
export function nameHolder(partition: MechanismPartition): Joint | undefined {
  const own = partition.ownJoints;
  return own.find((joint) => joint instanceof RealJoint && joint.input) ?? byLetter(own)[0];
}

/** The name its author gave the machine, if any. */
export function mechanismName(partition: MechanismPartition | undefined): string | undefined {
  if (!partition) return undefined;
  const holder = nameHolder(partition);
  const named = holder?.machineName
    ? holder
    : byLetter(partition.ownJoints).find((joint) => joint.machineName);
  return named?.machineName || undefined;
}

/**
 * What a reader calls the machine: its name, or "Mechanism M2". The letter
 * code stays beside a name ("Pump jack (M2)") wherever the playback rows,
 * which have room only for the code, need to be matched to it.
 */
export function mechanismLabel(
  partition: MechanismPartition | undefined,
  index: number,
  withCode = false
): string {
  const code = partition?.id ?? `M${index + 1}`;
  const name = mechanismName(partition);
  if (!name) return `Mechanism ${code}`;
  return withCode ? `${name} (${code})` : name;
}

/** Longest name kept: a panel title, not a paragraph. */
export const MAX_MECHANISM_NAME = 40;

/** A typed name as it is stored: trimmed, one line, and not too long. Empty clears it. */
export function cleanMechanismName(typed: string): string {
  return typed.replace(/\s+/g, ' ').trim().slice(0, MAX_MECHANISM_NAME);
}

/**
 * Name a machine: written to its holder, and cleared from every other joint of
 * it, so the machine carries one name however it was named before.
 */
export function writeMechanismName(partition: MechanismPartition, typed: string): void {
  const name = cleanMechanismName(typed);
  for (const joint of partition.ownJoints) joint.machineName = '';
  const holder = nameHolder(partition);
  if (holder) holder.machineName = name;
}
