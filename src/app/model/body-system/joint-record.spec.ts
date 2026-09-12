import { BodyDocument, emptyBodyDocument } from './body-document';
import { BodyFactory } from './body-factory';
import { BodyId, newRecordId, WORLD } from './body-id';
import { validateBodyDocument } from './body-validation';
import { jointCoordinate } from './joint-coordinate';
import { createBodyCylinder } from './cylinder-factory';
import { reverseJoint } from './reverse-joint';
import { rebaseBody } from './rebase-body';
import { add, localToWorld, rotate, worldToLocal } from './body-frame';
import { GuidedJoint } from './joint-record';

describe('native joint records', () => {
  it('keeps guide artwork on its material owner through order reversal and a local-frame change', () => {
    const { f, a, aa, ab } = fixture();
    const joint = f.joint('prismatic', aa, ab, 1.1) as GuidedJoint;
    const guide = { bodyId: a, frame: joint.frameA, from: -2, to: 5 };
    const displayed = { ...joint, guideDisplay: guide };
    const reversed = reverseJoint(displayed) as GuidedJoint;
    expect(reversed.guideDisplay).toBe(guide);
    const before = {
      ...f.document,
      joints: f.document.joints.map((j) => (j.id === joint.id ? reversed : j)),
    };
    const after = rebaseBody(before, a, { x: 2, y: -3, angle: 0.7 });
    expect(validateBodyDocument(after)).toEqual([]);
    const station = (document: BodyDocument, end: 'from' | 'to') => {
      const current = document.joints.find((j) => j.id === joint.id) as GuidedJoint;
      const art = current.guideDisplay!;
      const anchor = document.attachments.find((p) => p.id === art.frame.attachmentId)!;
      const pose = document.bodies.find((b) => b.id === art.bodyId)!.pose;
      return localToWorld(pose, add(anchor.point, rotate({ x: art[end]!, y: 0 }, art.frame.angle)));
    };
    for (const end of ['from', 'to'] as const) {
      expect(station(after, end).x).toBeCloseTo(station(before, end).x, 12);
      expect(station(after, end).y).toBeCloseTo(station(before, end).y, 12);
    }
  });
  it('maps reversed R/P coordinates and virtual work without exchanging a free slot carrier', () => {
    const f = new BodyFactory();
    const a = f.body('carrier', { x: 1, y: -2, angle: 0.8 }, [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    const b = f.body('rider', { x: 3, y: 4, angle: -0.2 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const aa = f.attachment(a, { x: 0.4, y: 1 });
    const ab = f.attachment(
      b,
      worldToLocal(
        f.document.bodies.find((body) => body.id === b)!.pose,
        localToWorld(f.document.bodies.find((body) => body.id === a)!.pose, { x: 0.4, y: 1 })
      )
    );
    const anchors = new Map(f.document.attachments.map((anchor) => [anchor.id, anchor]));
    for (const kind of ['revolute', 'prismatic'] as const) {
      const joint = f.joint(kind, aa, ab, 1.2);
      const reverse = reverseJoint(joint);
      const coordinate = kind === 'revolute' ? 'angle' : 'travel';
      const values = [0, 0.02, 10].map((t) => {
        const poses = new Map(f.document.bodies.map((body) => [body.id, body.pose]));
        const poseB = poses.get(b)!;
        if (kind === 'revolute') poses.set(b, { ...poseB, angle: poseB.angle + t });
        else {
          // Independent relative translation along a fixed, oblique world heading.
          poses.set(b, {
            ...poseB,
            x: poseB.x + t * Math.cos(1.2),
            y: poseB.y + t * Math.sin(1.2),
          });
        }
        const forwardValue = jointCoordinate(joint, coordinate, poses, anchors);
        const reverseValue = jointCoordinate(reverse, coordinate, poses, anchors);
        expect(reverseValue).toBeCloseTo(-forwardValue, 11);
        return [forwardValue, reverseValue];
      });
      const power = (7 * (values[1][0] - values[0][0])) / 0.02;
      const reversedPower = (-7 * (values[1][1] - values[0][1])) / 0.02;
      expect(reversedPower).toBeCloseTo(power, 11);
      expect(reverseJoint(reverse)).toMatchObject(joint);
    }
    expect(() => reverseJoint(f.joint('pin-in-slot', aa, ab))).toThrow();
  });
  it('constructs a cylinder as two material members and one P, with free outer attachments', () => {
    const { document, assembly } = createBodyCylinder(
      emptyBodyDocument(),
      { x: 3, y: -2, angle: 0.8 },
      { barrelLength: 3, rodLength: 2, bore: 0.4, rodDiameter: 0.2, stroke: 1.5 },
      0.7
    );
    expect(validateBodyDocument(document)).toEqual([]);
    expect(document.bodies.filter((body) => body.kind === 'material').length).toBe(2);
    expect(document.joints.length).toBe(1);
    const internal = document.joints[0];
    expect(internal.kind).toBe('prismatic');
    expect(internal.frameA.attachmentId).not.toBe(assembly.barrelMount);
    expect(internal.frameB.attachmentId).not.toBe(assembly.rodMount);
    expect(
      jointCoordinate(
        internal,
        'travel',
        new Map(document.bodies.map((body) => [body.id, body.pose])),
        new Map(document.attachments.map((anchor) => [anchor.id, anchor]))
      )
    ).toBeCloseTo(0.7, 12);
    expect(document.limits[0].lower).toBe(0);
    expect(document.limits[0].upper).toBe(1.5);
  });
  function fixture() {
    const f = new BodyFactory();
    const a = f.body('plate', { x: 0, y: 0, angle: 0.6 }, [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    const b = f.body('rider', { x: 3, y: 2, angle: 0.9 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const aa = f.attachment(a, { x: 0.2, y: 1 });
    const ab = f.attachment(
      b,
      worldToLocal(
        f.document.bodies.find((body) => body.id === b)!.pose,
        add(
          localToWorld(f.document.bodies.find((body) => body.id === a)!.pose, { x: 0.2, y: 1 }),
          rotate({ x: 2, y: 0 }, 1.1)
        )
      )
    );
    const slot = f.joint('pin-in-slot', aa, ab, 1.1);
    return { f, a, b, aa, ab, slot };
  }

  it('keeps two independently directed slots on one carrier without endpoint inference', () => {
    const { f, a, b, slot } = fixture();
    const second = f.joint(
      'pin-in-slot',
      f.attachment(a, { x: 1, y: -1 }),
      f.attachment(
        b,
        worldToLocal(
          f.document.bodies.find((body) => body.id === b)!.pose,
          add(
            localToWorld(f.document.bodies.find((body) => body.id === a)!.pose, { x: 1, y: -1 }),
            rotate({ x: 3, y: 0 }, -0.7)
          )
        )
      ),
      -0.7
    );
    expect(validateBodyDocument(f.document)).toEqual([]);
    expect(slot.frameA.angle).not.toBe(second.frameA.angle);
    const poses = new Map(f.document.bodies.map((body) => [body.id, body.pose]));
    const anchors = new Map(f.document.attachments.map((anchor) => [anchor.id, anchor]));
    expect(jointCoordinate(slot, 'travel', poses, anchors)).toBeCloseTo(0, 12);
    expect(jointCoordinate(slot, 'angle', poses, anchors)).toBeCloseTo(0, 12);
    const shifted = new Map(poses);
    shifted.set(b, {
      ...poses.get(b)!,
      x: poses.get(b)!.x + 2,
      angle: poses.get(b)!.angle + 8 * Math.PI,
    });
    expect(jointCoordinate(slot, 'travel', shifted, anchors)).toBeCloseTo(2 * Math.cos(1.1), 12);
    expect(jointCoordinate(slot, 'angle', shifted, anchors)).toBeCloseTo(8 * Math.PI, 12);
  });

  it('rejects IDs and owners that would silently retarget a relationship', () => {
    const { f, a, aa, slot } = fixture();
    const variants: [BodyDocument, string][] = [
      [
        { ...f.document, bodies: [...f.document.bodies, f.document.bodies[1]] },
        'duplicate-or-empty-id',
      ],
      [{ ...f.document, joints: [{ ...slot, bodyB: a }] }, 'self-connection'],
      [
        { ...f.document, joints: [{ ...slot, frameB: { attachmentId: aa, angle: 0 } }] },
        'wrong-attachment-owner',
      ],
      [
        { ...f.document, joints: [{ ...slot, frameA: { ...slot.frameA, angle: NaN } }] },
        'nonfinite-axis',
      ],
      [
        {
          ...f.document,
          forces: [
            {
              id: newRecordId<'force'>(),
              bodyId: 'missing' as BodyId,
              point: { x: 0, y: 0 },
              vector: { x: 1, y: 0 },
              frame: 'world',
              label: '',
              couple: 0,
            },
          ],
        },
        'missing-material-owner',
      ],
    ];
    for (const [document, code] of variants)
      expect(validateBodyDocument(document).some((issue) => issue.code === code)).toBe(true);
  });

  it('reserves immutable WORLD and validates coordinate kinds before any solver runs', () => {
    expect(validateBodyDocument(emptyBodyDocument())).toEqual([]);
    expect(validateBodyDocument({ ...emptyBodyDocument(), bodies: [] })).toContainEqual({
      code: 'missing-world',
      path: 'bodies',
    });
    expect(
      validateBodyDocument({
        ...emptyBodyDocument(),
        bodies: [{ kind: 'world', id: WORLD, pose: { x: 1, y: 0, angle: 0 } }],
      })
    ).toContainEqual({ code: 'immutable-world', path: 'bodies.WORLD' });
    const { f, aa, ab } = fixture();
    const weld = f.joint('weld', aa, ab);
    const document: BodyDocument = {
      ...f.document,
      drivers: [
        {
          id: newRecordId<'driver'>(),
          coordinate: { jointId: weld.id, coordinate: 'angle' },
          profile: { kind: 'constant-speed', initial: 0, speed: 1 },
        },
      ],
    };
    expect(
      validateBodyDocument(document).some((issue) => issue.code === 'missing-coordinate')
    ).toBe(true);
  });

  it('rejects a stale shape binding instead of moving a tracer into the hull', () => {
    const { f, a, aa } = fixture();
    const body = f.document.bodies.find((body) => body.id === a)!;
    if (body.kind !== 'material' || body.geometry.kind !== 'bar') throw new Error('Expected bar');
    const document = {
      ...f.document,
      attachments: f.document.attachments.map((anchor) =>
        anchor.id !== aa
          ? anchor
          : {
              ...anchor,
              vertexId: body.geometry.kind === 'bar' ? body.geometry.vertices[0].id : undefined,
            }
      ),
    };
    expect(
      validateBodyDocument(document).some((issue) => issue.code === 'invalid-vertex-binding')
    ).toBe(true);
  });
});
