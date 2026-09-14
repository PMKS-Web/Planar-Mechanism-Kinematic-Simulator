import { nativeEditableFourBar } from '../../../test-utils/verification/native-geometry-fixture';
import { nativeAxialCarriage } from '../../../test-utils/verification/native-cylinder-fixtures';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';
import { BodyDocumentAuthority } from './body-document-authority';
import { nativeDeleteCommand, nativeGroundCommand } from './body-menu-commands';
import { selectionBodies } from './body-joint-interaction';
import { BodySelectionRef } from './body-edit-types';
import { WORLD } from './body-id';

const state = NATIVE_EDIT_CONTEXT.state;

describe('a reader’s Delete takes the links it would strand', () => {
  /**
   * The public rule: the joint goes, and so does every link the delete would
   * leave with fewer than two of its own points.
   */
  it('takes the bar left with one point, and leaves the one that keeps a tracer', () => {
    const fixture = nativeEditableFourBar();
    const authority = new BodyDocumentAuthority(fixture.document);
    const target: BodySelectionRef = { kind: 'joint', id: fixture.bJoint.id };
    const [crank, coupler] = [fixture.bJoint.bodyA, fixture.coupler];
    expect(
      authority.commit(nativeDeleteCommand(authority.document, [target]), state)
    ).toMatchObject({ ok: true });
    const standing = authority.document.bodies.map((body) => body.id);
    // The crank held the pin and its own ground anchor: one point left, so it
    // goes, and its ground anchor goes with it.
    expect(standing).not.toContain(crank);
    // The coupler still has its far pin and its off-axis tracer: two points.
    expect(standing).toContain(coupler);
    expect(standing).toContain(WORLD);
    expect(authority.document.joints.some((joint) => joint.id === fixture.bJoint.id)).toBe(false);
  });

  /** One pass, the way the public rule has it: the rocker is nobody's casualty. */
  it('does not go on to the links those leave behind', () => {
    const fixture = nativeEditableFourBar();
    const authority = new BodyDocumentAuthority(fixture.document);
    const target: BodySelectionRef = { kind: 'joint', id: fixture.bJoint.id };
    const rocker = authority.document.bodies.find(
      (body) => body.id !== fixture.coupler && body.id !== fixture.bJoint.bodyA && body.id !== WORLD
    )!;
    expect(
      authority.commit(nativeDeleteCommand(authority.document, [target]), state)
    ).toMatchObject({ ok: true });
    expect(authority.document.bodies.map((body) => body.id)).toContain(rocker.id);
  });

  /**
   * A cylinder's mount is its own casualty rule: the barrel keeps its bore
   * anchor and nothing else, so the assembly goes whole — which is the public
   * row's "Delete Joint (and Cylinder)".
   */
  it('takes the whole cylinder when a mount pin goes', () => {
    const fixture = nativeAxialCarriage();
    const authority = new BodyDocumentAuthority(fixture.document);
    const mount = authority.document.joints.find(
      (joint) =>
        (joint.frameA.attachmentId === fixture.assembly.barrelMount ||
          joint.frameB.attachmentId === fixture.assembly.barrelMount) &&
        joint.id !== fixture.assembly.internalJoint
    )!;
    const target: BodySelectionRef = { kind: 'joint', id: mount.id };
    expect(
      authority.commit(nativeDeleteCommand(authority.document, [target]), state)
    ).toMatchObject({ ok: true });
    expect(authority.document.assemblies).toEqual([]);
    expect(authority.document.bodies.map((body) => body.id)).not.toContain(fixture.assembly.barrel);
    expect(authority.document.bodies.map((body) => body.id)).not.toContain(fixture.assembly.rod);
  });

  /**
   * Releasing a relationship is not a reader's Delete.
   *
   * The native model keeps a point and the connection through it as two
   * records, so unchecking Grounded removes a joint — and must leave the crank
   * standing, ungrounded, the way the public toggle does.
   */
  it('leaves the material standing when a connection is released instead', () => {
    const fixture = nativeEditableFourBar();
    const authority = new BodyDocumentAuthority(fixture.document);
    const driven = authority.document.drivers[0].coordinate.jointId;
    const target: BodySelectionRef = { kind: 'joint', id: driven };
    const crank = selectionBodies(authority.document, [target]).find((id) => id !== WORLD)!;
    const command = nativeGroundCommand(authority.document, target, crank, { x: 0, y: 0 })!;
    expect(authority.commit(command, state)).toMatchObject({ ok: true });
    expect(authority.document.bodies.map((body) => body.id)).toContain(crank);
  });
});
