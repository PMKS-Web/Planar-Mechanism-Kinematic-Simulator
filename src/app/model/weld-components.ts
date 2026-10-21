import { RealJoint } from './joint';
import { RealLink } from './link';

/** Bodies still held together by the other welds when one connection is released. */
export function weldComponents(members: RealLink[], except?: RealJoint): RealLink[][] {
  const remaining = [...members];
  const components: RealLink[][] = [];
  while (remaining.length > 0) {
    const component: RealLink[] = [];
    const queue = [remaining.shift()!];
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (let index = remaining.length - 1; index >= 0; index--) {
        const candidate = remaining[index];
        const sharesWeld = current.joints.some(
          (joint) =>
            joint !== except &&
            joint instanceof RealJoint &&
            joint.isWelded &&
            candidate.joints.includes(joint)
        );
        if (sharesWeld) queue.push(...remaining.splice(index, 1));
      }
    }
    components.push(component);
  }
  return components;
}
